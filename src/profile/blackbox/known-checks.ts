// The check function is not derived yet. These pairs come from the morning examples (tests/corpus).
// Key: COMMAND;args joined by ";" without the check field. Replace with the real function once fitted.
export const KNOWN_VALID: Record<string, number> = {
  "ALTA;Lucia": 82,
  "ALTA;Mateo": 3,
  "CONSULTA;AC-0001": 14,
  "CONSULTA;AC-0002": 11,
  "CONSULTA;AC-0009": 87,
  "DEPOSITO;AC-0001;250000": 86,
  "DEPOSITO;AC-0002;700": 35,
  "TRANSFER;AC-0001;AC-0002;40000": 86,
  "TRANSFER;AC-0001;AC-0002;100000": 12,
  "TRANSFER;AC-0001;AC-0002;120000": 55,
  "TRANSFER;AC-0002;AC-0001;50000": 23,
  "ANULA;OP-0003": 66,
};

export const KNOWN_INVALID: Record<string, number[]> = {
  "ALTA;Lucia": [83],
};
