import { PageContainer } from "../../components/Layout";
import { Card } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { CompanyForm } from "./CompanyForm";

export function EmployerDashboardPage() {
  const { company, refresh } = useAuth();

  if (!company) {
    return (
      <PageContainer>
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Set up your company</h1>
          <p className="mt-2 text-sm text-slate-600">Job seekers see this on every job you post.</p>
          <Card className="mt-6">
            <CompanyForm company={null} onSaved={() => void refresh()} />
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">{company.name}</h1>
    </PageContainer>
  );
}
