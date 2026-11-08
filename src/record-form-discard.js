export const DISCARD_RECORD_CHANGES =
  "Kaydedilmemiş değişiklikler var. Kaydetmeden kapatmak istiyor musun?";

// Compare field values rather than input events so undoing an edit is pristine.
// Disabled fields still belong to the draft; expanding details does not.
export function recordFormValues(form, { exclude = [] } = {}) {
  const omitted = new Set(exclude);
  return JSON.stringify(
    Array.from(form.elements)
      .filter(
        (field) =>
          field.name &&
          !omitted.has(field.name) &&
          !["button", "submit", "reset"].includes(field.type),
      )
      .map((field) => [
        field.name,
        field.type,
        ["checkbox", "radio"].includes(field.type)
          ? field.checked
          : field.multiple && field.selectedOptions
            ? Array.from(field.selectedOptions, (option) => option.value)
            : field.value,
      ]),
  );
}
