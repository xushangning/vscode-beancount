import * as vscode from 'vscode';
import { parse, Transaction, Directive } from './parser';

export class JournalPreviewProvider implements vscode.CustomTextEditorProvider {

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new JournalPreviewProvider(context);
    return vscode.window.registerCustomEditorProvider(
      'beancount.journalPreview',
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) { }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true
    };

    const updateWebview = () => {
      const content = document.getText();
      const directives = parse(content, document.fileName);
      webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, directives);
    };

    // Update on document changes (debounced)
    let updateTimeout: NodeJS.Timeout | undefined;
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
        updateTimeout = setTimeout(updateWebview, 300);
      }
    });

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(message => {
      if (message.type === 'goToLine') {
        const editor = vscode.window.visibleTextEditors.find(
          e => e.document.uri.toString() === document.uri.toString()
        );
        if (editor) {
          const position = new vscode.Position(message.line - 1, 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
          vscode.window.showTextDocument(editor.document, editor.viewColumn);
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
    });

    // Initial render
    updateWebview();
  }

  private getHtmlForWebview(webview: vscode.Webview, directives: Directive[]): string {
    const transactions = directives.filter(
      (d): d is Transaction => d.type === 'Transaction'
    ).reverse(); // Most recent first

    const transactionRows = transactions.map(txn => {
      // Get the first posting with an explicit amount
      const mainPosting = txn.postings.find(p => p.units);
      const amountHtml = mainPosting
        ? `${this.formatNumber(mainPosting.units!.number)} ${mainPosting.units!.currency}`
        : '';

      const tagsHtml = txn.tags.length
        ? txn.tags.map(t => `<span class="tag">#${t}</span>`).join(' ')
        : '';
      const linksHtml = txn.links.length
        ? txn.links.map(l => `<span class="link">^${l}</span>`).join(' ')
        : '';

      const flagClass = txn.flag === '!' ? 'pending' : '';
      const payeeHtml = txn.payee ? `<span class="payee">${this.escapeHtml(txn.payee)}</span>` : '';
      const separator = txn.payee && txn.narration ? ' · ' : '';
      const narrationHtml = txn.narration ? this.escapeHtml(txn.narration) : '';
      const metaHtml = (tagsHtml || linksHtml) ? ` ${tagsHtml} ${linksHtml}`.trim() : '';

      return `
        <tr class="transaction ${flagClass}" data-line="${txn.meta.lineno}">
          <td class="date">${txn.date}</td>
          <td class="flag">${txn.flag}</td>
          <td class="desc">
            ${payeeHtml}${separator}${narrationHtml}${metaHtml ? ' ' + metaHtml : ''}
          </td>
          <td class="amount">${amountHtml}</td>
        </tr>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
    <title>Journal</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 10px 20px;
            line-height: 1.4;
        }
        h1 {
            font-size: 1.4em;
            margin-bottom: 8px;
            color: var(--vscode-titleBar-activeForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }
        .summary {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
            font-size: 0.9em;
        }
        table.journal {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--vscode-editor-font-family), monospace;
            font-size: 0.95em;
        }
        table.journal th {
            text-align: left;
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            color: var(--vscode-descriptionForeground);
            font-weight: normal;
            font-size: 0.9em;
        }
        table.journal th:last-child {
            text-align: right;
        }
        table.journal td {
            padding: 4px 8px;
            vertical-align: top;
        }
        tr.transaction {
            cursor: pointer;
        }
        tr.transaction:hover {
            background: var(--vscode-list-hoverBackground);
        }
        tr.transaction.pending {
            background: color-mix(in srgb, var(--vscode-editorWarning-foreground) 10%, transparent);
        }
        tr.transaction.pending:hover {
            background: color-mix(in srgb, var(--vscode-editorWarning-foreground) 20%, transparent);
        }
        td.date {
            white-space: nowrap;
            color: var(--vscode-textLink-foreground);
        }
        td.desc {
            word-break: break-word;
        }
        td.amount {
            text-align: right;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
            color: var(--vscode-symbolIcon-constantForeground);
        }
        td.flag {
            font-weight: bold;
            text-align: center;
            white-space: nowrap;
        }
        .pending td.flag {
            color: var(--vscode-editorWarning-foreground);
        }
        .payee {
            color: var(--vscode-symbolIcon-functionForeground);
        }
        .tag, .link {
            font-size: 0.9em;
            color: var(--vscode-textPreformat-foreground);
            margin-left: 4px;
        }
    </style>
</head>
<body>
    <h1>Journal</h1>
    <div class="summary">${transactions.length} transactions</div>
    <table class="journal">
        <thead>
            <tr><th>Date</th><th>F</th><th>Counterparty · Narration</th><th>Price</th></tr>
        </thead>
        <tbody>
            ${transactionRows}
        </tbody>
    </table>
    <script>
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('tr.transaction').forEach(el => {
            el.addEventListener('click', () => {
                const line = parseInt(el.dataset.line, 10);
                vscode.postMessage({ type: 'goToLine', line });
            });
        });
    </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatNumber(num: string): string {
    const n = parseFloat(num);
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
