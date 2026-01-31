// TypeScript interfaces for Beancount directives

export interface Meta {
  filename: string;
  lineno: number;
}

export interface Entry {
  type: string;
  date: string;
  meta: Meta;
}

export interface Open extends Entry {
  type: 'Open';
  account: string;
  currencies?: string[];
}

export interface Transaction extends Entry {
  type: 'Transaction';
  flag: '*' | '!';
  payee: string | null;
  narration: string;
  tags: string[];
  links: string[];
  postings: Posting[];
}

export interface Posting {
  account: string;
  units: { number: string; currency: string } | null;
}

export interface Balance extends Entry {
  type: 'Balance';
  account: string;
  amount: { number: string; currency: string };
}

export interface Option {
  type: 'Option';
  key: string;
  value: string;
}

export type Directive = Open | Transaction | Balance | Option;
