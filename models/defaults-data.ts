export const DEFAULT_PROMPT_ANALYSE_NEW_FILE = `You are an accountant for Essential. Read the receipt and extract:

{fields}

Also extract "items": each separate product or charge that has its own name and amount.

GL codes. categoryCode must be exactly one of these codes:

{categories}

Projects:

{projects}

RULES:
- categoryCode must be one of the GL codes above. Never invent a code, and do not add a department suffix.
- GST is Australian. vat is the GST amount in the receipt currency. vat_rate is 10 when GST is charged and 0 when the receipt is GST-free.
- If you cannot find a value, leave it blank. Never make up a merchant, date, amount, or GL code.
- Return only one object`

export const DEFAULT_SETTINGS = [
  {
    code: "default_currency",
    name: "Default Currency",
    description: "Don't change this setting if you already have multi-currency transactions. I won't recalculate them.",
    value: "AUD",
  },
  {
    code: "default_category",
    name: "Default Category",
    description: "",
    value: "",
  },
  {
    code: "default_project",
    name: "Default Project",
    description: "",
    value: "personal",
  },
  {
    code: "default_type",
    name: "Default Type",
    description: "",
    value: "expense",
  },
  {
    code: "prompt_analyse_new_file",
    name: "Prompt for Analyze Transaction",
    description: "Allowed variables: {fields}, {categories}, {categories.code}, {projects}, {projects.code}",
    value: DEFAULT_PROMPT_ANALYSE_NEW_FILE,
  },
  {
    code: "llm_attachment_format",
    name: "Image Format for AI Analysis",
    description: "WebP is smaller; use PNG or JPEG for local models like Ollama that cannot decode WebP",
    value: "webp",
  },
  {
    code: "is_welcome_message_hidden",
    name: "Do not show welcome message on dashboard",
    description: "",
    value: "false",
  },
]

export { ESSENTIAL_CATEGORIES as DEFAULT_CATEGORIES } from "@/models/gl-codes"

export const DEFAULT_PROJECTS = [{ code: "personal", name: "Personal", llm_prompt: "personal", color: "#1e202b" }]

export const DEFAULT_CURRENCIES = [
  { code: "AUD", name: "Aus dollar" },
  { code: "USD", name: "USD" },
  { code: "VND", name: "Viet dong" },
  { code: "HKD", name: "HKD" },
  { code: "SGD", name: "SGD" },
  { code: "CNY", name: "Renminbi" },
  { code: "PHP", name: "PH pesos" },
  { code: "EUR", name: "Euro" },
  { code: "NZD", name: "NZD" },
  { code: "IDR", name: "Indonesian rupiah" },
  { code: "MYR", name: "Malaysian dollar" },
  { code: "JPY", name: "Yen" },
]

/** Calculated from the total and GST. Stored only as a column choice, never as receipt data. */
export const COMPUTED_FIELD_CODES = new Set(["netAmountAfterGst"])

export const DEFAULT_FIELDS = [
  {
    code: "name",
    name: "Name",
    type: "string",
    llm_prompt: "human readable name, summarize what is bought or paid for in the invoice",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: true,
    isExtra: false,
  },
  {
    code: "description",
    name: "Description",
    type: "string",
    llm_prompt: "description of the transaction",
    isVisibleInList: false,
    isVisibleInAnalysis: false,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "merchant",
    name: "Merchant",
    type: "string",
    llm_prompt: "merchant name, use the original spelling and language",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "issuedAt",
    name: "Issued At",
    type: "string",
    llm_prompt: "issued at date (YYYY-MM-DD format)",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: true,
    isExtra: false,
  },
  {
    code: "projectCode",
    name: "Project",
    type: "string",
    llm_prompt: "project code, one of: {projects.code}",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "categoryCode",
    name: "GL Code",
    type: "string",
    llm_prompt: "Essential GL code. Return exactly one code from: {categories.code}",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: true,
    isExtra: false,
  },
  {
    code: "files",
    name: "Files",
    type: "string",
    llm_prompt: "",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "total",
    name: "Total",
    type: "number",
    llm_prompt: "total total of the transaction",
    isVisibleInList: true,
    isVisibleInAnalysis: true,
    isRequired: true,
    isExtra: false,
  },
  {
    code: "currencyCode",
    name: "Currency",
    type: "string",
    llm_prompt: "currency code, ISO 4217 three letter code like USD, EUR, including crypto codes like BTC, ETH, etc",
    isVisibleInList: false,
    isVisibleInAnalysis: true,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "convertedTotal",
    name: "Converted Total",
    type: "number",
    llm_prompt: "",
    isVisibleInList: false,
    isVisibleInAnalysis: false,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "convertedCurrencyCode",
    name: "Converted Currency Code",
    type: "string",
    llm_prompt: "",
    isVisibleInList: false,
    isVisibleInAnalysis: false,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "type",
    name: "Type",
    type: "string",
    llm_prompt: "",
    isVisibleInList: false,
    isVisibleInAnalysis: true,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "note",
    name: "Note",
    type: "string",
    llm_prompt: "",
    isVisibleInList: false,
    isVisibleInAnalysis: false,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "vat_rate",
    name: "GST Rate",
    type: "number",
    llm_prompt: "Australian GST rate as a percent. Use 10 when GST is charged and 0 when the receipt is GST-free.",
    isVisibleInList: false,
    isVisibleInAnalysis: true,
    isRequired: false,
    isExtra: true,
  },
  {
    code: "vat",
    name: "GST Amount",
    type: "number",
    llm_prompt: "GST amount in the receipt currency. Use 0 when the receipt is GST-free.",
    isVisibleInList: false,
    isVisibleInAnalysis: true,
    isRequired: false,
    isExtra: true,
  },
  {
    code: "netAmountAfterGst",
    name: "Net Amount after GST",
    type: "number",
    llm_prompt: "",
    isVisibleInList: false,
    isVisibleInAnalysis: false,
    isRequired: false,
    isExtra: false,
  },
  {
    code: "text",
    name: "Extracted Text",
    type: "string",
    llm_prompt: "extract all recognised text from the invoice",
    isVisibleInList: false,
    isVisibleInAnalysis: false,
    isRequired: false,
    isExtra: false,
  },
]
