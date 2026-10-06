const HEADER_ALIASES = new Map([
  ['date', 'date'],
  ['transaction date', 'date'],
  ['txn date', 'date'],
  ['transaction dt', 'date'],
  ['txn dt', 'date'],
  ['value date', 'valueDate'],
  ['posting date', 'valueDate'],
  ['value dt', 'valueDate'],
  ['narration', 'narration'],
  ['description', 'narration'],
  ['particulars', 'narration'],
  ['transaction details', 'narration'],
  ['remarks', 'narration'],
  ['withdrawal', 'withdrawal'],
  ['withdrawal amount', 'withdrawal'],
  ['withdrawal amt', 'withdrawal'],
  ['debit', 'debit'],
  ['debit amount', 'debit'],
  ['debit amt', 'debit'],
  ['deposit', 'deposit'],
  ['deposit amount', 'deposit'],
  ['deposit amt', 'deposit'],
  ['credit', 'credit'],
  ['credit amount', 'credit'],
  ['credit amt', 'credit'],
  ['closing balance', 'closing balance'],
  ['closingbalance', 'closing balance'],
  ['closing bal', 'closing balance'],
  ['balance', 'balance'],
  ['available balance', 'available balance'],
  ['reference', 'reference'],
  ['utr', 'reference'],
  ['transaction reference', 'reference'],
  ['ref no', 'reference'],
  ['chq ref no', 'reference'],
  ['cheque ref no', 'reference'],
  ['cheque number', 'cheque number'],
  ['cheque no', 'cheque number'],
  ['chq no', 'cheque number'],
  ['name', 'name'],
  ['payee', 'name'],
  ['payer', 'name'],
  ['beneficiary', 'name'],
  ['method', 'method'],
  ['mode', 'method'],
  ['payment method', 'method'],
  ['account', 'account'],
  ['account name', 'account'],
  ['bank account', 'account'],
  ['category', 'category'],
]);

const normalizeHeader = (value) => String(value ?? '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/[._:/\-()]+/g, ' ')
  .replace(/\b(inr|rs|rupees)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const parseDelimitedRows = (content, delimiter) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += character;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
};

const countDelimiter = (line, delimiter) => {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
};

const detectDelimiter = (content) => {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim()) || '';
  const options = [',', '\t', ';'];
  return options.sort((left, right) => countDelimiter(firstLine, right) - countDelimiter(firstLine, left))[0];
};

const canonicalHeader = (header) => HEADER_ALIASES.get(normalizeHeader(header)) || normalizeHeader(header);

export const parseStatementText = (content) => {
  const delimiter = detectDelimiter(content);
  const parsedRows = parseDelimitedRows(content, delimiter);
  if (parsedRows.length < 2) {
    return { delimiter, headers: [], rows: [] };
  }

  const headers = parsedRows[0].map(canonicalHeader);
  const rows = parsedRows.slice(1).map((values) => headers.reduce((result, header, index) => {
    if (!header) return result;
    result[header] = values[index] ?? '';
    return result;
  }, {}));

  return { delimiter, headers, rows };
};
