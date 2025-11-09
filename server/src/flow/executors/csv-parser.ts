import { NodeExecutor } from "./types";

/**
 * CSV Parser Executor
 * Parses CSV string to array of JSON objects
 */
export const executeCsvParser: NodeExecutor = async (node, input, context) => {
  if (typeof input !== "string") {
    throw new Error("CSV Parser input must be a string");
  }

  const config = node.data.config as any || {};
  const delimiter = (config.delimiter as string) || ",";
  const quote = (config.quote as string) || '"';
  const hasHeader = config.hasHeader !== false;
  const skipEmptyLines = config.skipEmptyLines !== false;
  const trim = config.trim !== false;
  const customColumns = config.columns ? (config.columns as string).split(",").map((c: string) => c.trim()) : null;

  const lines = input.split(/\r?\n/);
  const result: any[] = [];
  
  let headers: string[] = [];
  let startIndex = 0;

  if (hasHeader && !customColumns) {
    const headerLine = lines[0];
    headers = parseCSVLine(headerLine, delimiter, quote, trim);
    startIndex = 1;
  } else if (customColumns) {
    headers = customColumns;
    startIndex = hasHeader ? 1 : 0;
  } else {
    throw new Error("CSV Parser requires either header row or custom column names");
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    
    if (skipEmptyLines && line.trim() === "") {
      continue;
    }

    const values = parseCSVLine(line, delimiter, quote, trim);
    
    if (values.length === 0 || (values.length === 1 && values[0] === "")) {
      continue;
    }

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    
    result.push(row);
  }

  return {
    output: result,
  };
};

/**
 * Parse a single CSV line, respecting quotes and delimiters
 */
function parseCSVLine(line: string, delimiter: string, quote: string, trim: boolean): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === quote) {
      if (inQuotes && line[i + 1] === quote) {
        current += quote;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(trim ? current.trim() : current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(trim ? current.trim() : current);
  return result;
}
