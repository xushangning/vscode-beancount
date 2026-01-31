import { Directive, Open, Transaction, Balance, Option, Posting } from './types';

export function parse(content: string, filename: string): Directive[] {
  const lines = content.split('\n');
  const directives: Directive[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith(';')) {
      i++;
      continue;
    }

    // Option directive
    if (trimmed.startsWith('option')) {
      const option = parseOption(trimmed);
      if (option) {
        directives.push(option);
      }
      i++;
      continue;
    }

    // Date-prefixed directives
    const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)/);
    if (dateMatch) {
      const [, date, rest] = dateMatch;

      if (rest.startsWith('open')) {
        const open = parseOpen(date, rest, filename, i + 1);
        if (open) {
          directives.push(open);
        }
        i++;
      } else if (rest.startsWith('balance')) {
        const balance = parseBalance(date, rest, filename, i + 1);
        if (balance) {
          directives.push(balance);
        }
        i++;
      } else if (rest.startsWith('*') || rest.startsWith('!')) {
        // Transaction - collect postings
        const [txn, nextIndex] = parseTransaction(date, rest, lines, i, filename);
        directives.push(txn);
        i = nextIndex;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return directives;
}

function parseOption(line: string): Option | null {
  // Parse: option "key" "value"
  const match = line.match(/^option\s+"([^"]+)"\s+"([^"]+)"/);
  if (!match) {
    return null;
  }
  return { type: 'Option', key: match[1], value: match[2] };
}

function parseOpen(date: string, rest: string, filename: string, lineno: number): Open | null {
  // Parse: open Account:Name [CURRENCY...]
  const match = rest.match(/^open\s+(\S+)(?:\s+(.+))?/);
  if (!match) {
    return null;
  }
  const currencies = match[2]?.split(/[,\s]+/).filter(Boolean);
  return {
    type: 'Open',
    date,
    account: match[1],
    currencies,
    meta: { filename, lineno }
  };
}

function parseBalance(date: string, rest: string, filename: string, lineno: number): Balance | null {
  // Parse: balance Account:Name 123.45 USD
  const match = rest.match(/^balance\s+(\S+)\s+([\d,.-]+)\s+([A-Z]+)/);
  if (!match) {
    return null;
  }
  return {
    type: 'Balance',
    date,
    account: match[1],
    amount: { number: match[2].replace(/,/g, ''), currency: match[3] },
    meta: { filename, lineno }
  };
}

function parseTransaction(
  date: string,
  rest: string,
  lines: string[],
  startIndex: number,
  filename: string
): [Transaction, number] {
  // Parse: * ["Payee"] "Narration" #tag ^link
  const flag = rest[0] as '*' | '!';
  let remaining = rest.slice(1).trim();

  // Extract strings (payee and/or narration)
  const strings: string[] = [];
  const stringRe = /"([^"]*)"/g;
  let m;
  while ((m = stringRe.exec(remaining)) !== null) {
    strings.push(m[1]);
  }
  remaining = remaining.replace(/"[^"]*"/g, '').trim();

  // Extract tags and links
  const tags = [...remaining.matchAll(/#([A-Za-z0-9-]+)/g)].map(m => m[1]);
  const links = [...remaining.matchAll(/\^([A-Za-z0-9-]+)/g)].map(m => m[1]);

  // Determine payee/narration
  const payee = strings.length > 1 ? strings[0] : null;
  const narration = strings.length > 1 ? strings[1] : strings[0] || '';

  // Collect postings (indented lines)
  const postings: Posting[] = [];
  let i = startIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.match(/^\s+\S/)) {
      break; // Not indented = end of postings
    }

    const trimmed = line.trim();
    if (trimmed.startsWith(';')) {
      i++;
      continue; // Skip comment lines in postings
    }

    // Parse posting: Account:Name [123.45 USD]
    const postingMatch = trimmed.match(/^(\S+)(?:\s+([\d,.-]+)\s+([A-Z]+))?/);
    if (postingMatch) {
      postings.push({
        account: postingMatch[1],
        units: postingMatch[2]
          ? { number: postingMatch[2].replace(/,/g, ''), currency: postingMatch[3] }
          : null
      });
    }
    i++;
  }

  return [{
    type: 'Transaction',
    date,
    flag,
    payee,
    narration,
    tags,
    links,
    postings,
    meta: { filename, lineno: startIndex + 1 }
  }, i];
}
