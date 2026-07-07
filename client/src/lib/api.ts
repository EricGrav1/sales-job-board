export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super("API request failed");
    this.status = status;
    this.data = data;
  }
}

export type RoleType = "sdr" | "ae" | "am" | "field" | "inside" | "manager" | "other";
export type VerificationTier = "unverified" | "self_reported" | "verified";

export type Profile = {
  id: string;
  slug: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  roleType: RoleType | null;
  industries: string[];
  yearsExperience: number | null;
  oteMin: number | null;
  oteMax: number | null;
  location: string | null;
  remoteOk: boolean;
  isPublished?: boolean;
  verificationTier: VerificationTier;
  createdAt: string;
  updatedAt: string;
};

export type PerformanceRecord = {
  id: string;
  periodLabel: string;
  quotaAttainmentPct: number | null;
  rank: number | null;
  teamSize: number | null;
  notes: string | null;
  createdAt: string;
};

export type PublicProof = {
  id: string;
  type: string;
  status: "approved";
  createdAt: string;
  assetUrl: string | null;
  thumbUrl: string | null;
};

export type OwnProfileResponse = {
  profile: Profile | null;
  records: PerformanceRecord[];
  proofs: PublicProof[];
};

export type PublicProfileResponse = {
  profile: Profile;
  records: PerformanceRecord[];
  proofs: PublicProof[];
};

export type ProfilePayload = {
  displayName: string;
  headline?: string | null;
  bio?: string | null;
  roleType?: RoleType | null;
  industries?: string[];
  yearsExperience?: number | null;
  oteMin?: number | null;
  oteMax?: number | null;
  location?: string | null;
  remoteOk?: boolean;
};

export type PerformanceRecordPayload = {
  periodLabel: string;
  quotaAttainmentPct?: number | null;
  rank?: number | null;
  teamSize?: number | null;
  notes?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}
