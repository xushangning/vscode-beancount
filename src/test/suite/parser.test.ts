import * as assert from 'assert';
import { parse, Transaction, Open, Balance, Option } from '../../parser';

suite('Beancount Parser Test Suite', () => {

  test('Parse options', () => {
    const content = `option "title" "Test Ledger"
option "operating_currency" "USD"`;
    const entries = parse(content, 'test.beancount');

    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].type, 'Option');
    assert.strictEqual((entries[0] as Option).key, 'title');
    assert.strictEqual((entries[0] as Option).value, 'Test Ledger');
  });

  test('Parse open directive', () => {
    const content = `2024-01-01 open Assets:Checking USD`;
    const entries = parse(content, 'test.beancount');

    assert.strictEqual(entries.length, 1);
    const open = entries[0] as Open;
    assert.strictEqual(open.type, 'Open');
    assert.strictEqual(open.date, '2024-01-01');
    assert.strictEqual(open.account, 'Assets:Checking');
    assert.deepStrictEqual(open.currencies, ['USD']);
  });

  test('Parse simple transaction', () => {
    const content = `2024-01-05 * "Test narration"
  Assets:Checking  100.00 USD
  Expenses:Test`;
    const entries = parse(content, 'test.beancount');

    assert.strictEqual(entries.length, 1);
    const txn = entries[0] as Transaction;
    assert.strictEqual(txn.type, 'Transaction');
    assert.strictEqual(txn.date, '2024-01-05');
    assert.strictEqual(txn.flag, '*');
    assert.strictEqual(txn.payee, null);
    assert.strictEqual(txn.narration, 'Test narration');
    assert.strictEqual(txn.postings.length, 2);
    assert.strictEqual(txn.postings[0].account, 'Assets:Checking');
    assert.deepStrictEqual(txn.postings[0].units, { number: '100.00', currency: 'USD' });
    assert.strictEqual(txn.postings[1].units, null);
  });

  test('Parse transaction with payee', () => {
    const content = `2024-01-05 * "Payee Name" "Narration text"
  Assets:Checking  50.00 USD
  Expenses:Test`;
    const entries = parse(content, 'test.beancount');

    const txn = entries[0] as Transaction;
    assert.strictEqual(txn.payee, 'Payee Name');
    assert.strictEqual(txn.narration, 'Narration text');
  });

  test('Parse transaction with tags and links', () => {
    const content = `2024-01-05 * "Test" #tag1 #tag2 ^link1
  Assets:Checking  50.00 USD
  Expenses:Test`;
    const entries = parse(content, 'test.beancount');

    const txn = entries[0] as Transaction;
    assert.deepStrictEqual(txn.tags, ['tag1', 'tag2']);
    assert.deepStrictEqual(txn.links, ['link1']);
  });

  test('Parse pending transaction', () => {
    const content = `2024-01-05 ! "Pending transaction"
  Assets:Checking  50.00 USD
  Expenses:Test`;
    const entries = parse(content, 'test.beancount');

    const txn = entries[0] as Transaction;
    assert.strictEqual(txn.flag, '!');
  });

  test('Parse balance assertion', () => {
    const content = `2024-01-31 balance Assets:Checking 1,234.56 USD`;
    const entries = parse(content, 'test.beancount');

    assert.strictEqual(entries.length, 1);
    const balance = entries[0] as Balance;
    assert.strictEqual(balance.type, 'Balance');
    assert.strictEqual(balance.date, '2024-01-31');
    assert.strictEqual(balance.account, 'Assets:Checking');
    assert.deepStrictEqual(balance.amount, { number: '1234.56', currency: 'USD' });
  });

  test('Skip comments', () => {
    const content = `; This is a comment
2024-01-01 open Assets:Checking USD
; Another comment`;
    const entries = parse(content, 'test.beancount');

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].type, 'Open');
  });

  test('Parse amount with commas', () => {
    const content = `2024-01-05 * "Test"
  Assets:Checking  1,234,567.89 USD
  Expenses:Test`;
    const entries = parse(content, 'test.beancount');

    const txn = entries[0] as Transaction;
    assert.deepStrictEqual(txn.postings[0].units, { number: '1234567.89', currency: 'USD' });
  });

  test('Meta information', () => {
    const content = `2024-01-01 open Assets:Checking USD`;
    const entries = parse(content, 'myfile.beancount');

    const open = entries[0] as Open;
    assert.strictEqual(open.meta.filename, 'myfile.beancount');
    assert.strictEqual(open.meta.lineno, 1);
  });
});
