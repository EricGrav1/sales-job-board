import { useState, type FormEvent } from "react";
import { Alert, Button, SelectField, TextAreaField, TextField, readApiError, type FieldErrors } from "../../components/ui";
import { apiRequest } from "../../lib/api";
import type { Company } from "../../lib/auth";

const sizeOptions = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "201-1000", label: "201–1,000 employees" },
  { value: "1000+", label: "1,000+ employees" }
];

export function CompanyForm({ company, onSaved }: { company: Company | null; onSaved: (company: Company) => void }) {
  const [name, setName] = useState(company?.name ?? "");
  const [website, setWebsite] = useState(company?.website ?? "");
  const [sizeBand, setSizeBand] = useState<string>(company?.sizeBand ?? "");
  const [description, setDescription] = useState(company?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await apiRequest<{ company: Company }>("/api/employer/company", {
        method: company ? "PUT" : "POST",
        body: JSON.stringify({
          name,
          website: website.trim() || null,
          sizeBand: sizeBand || null,
          description: description.trim() || null
        })
      });
      onSaved(response.company);
    } catch (caught) {
      const { message, fields } = readApiError(caught);
      setError(message);
      setFieldErrors(fields);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <TextField label="Company name" required value={name} onChange={(event) => setName(event.target.value)} error={fieldErrors.name} />
      <TextField
        label="Website"
        type="url"
        placeholder="https://"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        error={fieldErrors.website}
      />
      <SelectField
        label="Company size"
        placeholder="Select…"
        options={sizeOptions}
        value={sizeBand}
        onChange={(event) => setSizeBand(event.target.value)}
        error={fieldErrors.sizeBand}
      />
      <TextAreaField
        label="About the company"
        rows={4}
        maxLength={2000}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={fieldErrors.description}
      />
      {error ? <Alert>{error}</Alert> : null}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : company ? "Save company" : "Create company"}
      </Button>
    </form>
  );
}
