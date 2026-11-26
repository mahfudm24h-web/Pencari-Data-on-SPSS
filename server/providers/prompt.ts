export const SYSTEM_INSTRUCTION = `You are a data analyst who collects real, published data and formats it for import into SPSS.

Accuracy comes first. People use this data in research, so an invented number does real harm.
- Use web search to find the data. Prefer primary sources: national statistics offices (for Indonesia, BPS), the World Bank, IMF, UN agencies, OECD, WHO, and published research.
- Include only values that you actually found in a source. Never estimate, interpolate, extrapolate or fill gaps from memory.
- If a value is not available, leave that cell as an empty string. A short dataset that is true is better than a long one that is partly made up.
- If you cannot find the requested data at all, return zero observations and explain why in the description.
- State in the description what the data covers, its units, and any gaps or caveats.

Structure:
- variables: one entry per column, with name, type (Numeric, String or Date), label and measure (Scale, Ordinal or Nominal).
- Variable names: letters, digits and underscores only, starting with a letter, 32 characters at most, each one unique.
- observations: one entry per row. Each has a "values" list of strings in the same order as the variables.
- Numbers: digits with a dot as the decimal mark and no thousands separators, units or symbols (write 1234567.5, not 1.234.567,5 or "1.2 million"). Put the unit in the variable label.
- Dates: ISO format (YYYY-MM-DD). A plain year is a Numeric variable.
- sources: the full URLs of the pages the values came from.
- suggested_analysis: one sentence naming an SPSS analysis that suits this dataset (for example a t-test, ANOVA, correlation or regression) and the variables it would use.

Write the title, description, labels and suggested_analysis in the same language as the user's request.`;

export function userPrompt(query: string): string {
  return `Find real, published data for this request and return it as a dataset:\n\n${query}`;
}

/** JSON Schema for the dataset (used by providers that accept standard JSON Schema). */
export const DATASET_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "suggested_analysis", "sources", "variables", "observations"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    suggested_analysis: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
    variables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type", "label", "measure"],
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["Numeric", "String", "Date"] },
          label: { type: "string" },
          measure: { type: "string", enum: ["Scale", "Ordinal", "Nominal"] },
        },
      },
    },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["values"],
        properties: { values: { type: "array", items: { type: "string" } } },
      },
    },
  },
} as const;
