import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBranches, useUserBranchAssignments, type Branch } from "@/hooks/use-branches";

const STORAGE_KEY = "active_branch_id";

interface BranchContextType {
  branches: Branch[];
  activeBranches: Branch[];
  /** null = كل الفروع (متاح فقط لغير المقيّدين) */
  activeBranchId: string | null;
  activeBranch: Branch | null;
  setActiveBranchId: (id: string | null) => void;
  /** هل المستخدم مقيّد بفروع محددة؟ */
  isRestricted: boolean;
  /** الفروع المسموح بها للمستخدم الحالي */
  accessibleBranches: Branch[];
  canAccessBranch: (branchId: string) => boolean;
  loading: boolean;
}

const BranchContext = createContext<BranchContextType>({
  branches: [],
  activeBranches: [],
  activeBranchId: null,
  activeBranch: null,
  setActiveBranchId: () => {},
  isRestricted: false,
  accessibleBranches: [],
  canAccessBranch: () => true,
  loading: true,
});

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const { data: assignments = [], isLoading: assignmentsLoading } =
    useUserBranchAssignments(user?.id);

  const isRestricted = role !== "admin" && assignments.length > 0;

  const accessibleBranches = useMemo(() => {
    if (!isRestricted) return branches;
    const allowed = new Set(assignments.map((a) => a.branch_id));
    return branches.filter((b) => allowed.has(b.id));
  }, [branches, assignments, isRestricted]);

  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  // تصحيح الفرع النشط إذا لم يعد مسموحًا به
  useEffect(() => {
    if (branchesLoading || assignmentsLoading) return;
    if (activeBranchId && !accessibleBranches.some((b) => b.id === activeBranchId)) {
      const fallback =
        assignments.find((a) => a.is_default)?.branch_id ??
        accessibleBranches[0]?.id ??
        null;
      setActiveBranchIdState(isRestricted ? fallback : null);
    } else if (!activeBranchId && isRestricted) {
      const fallback =
        assignments.find((a) => a.is_default)?.branch_id ??
        accessibleBranches[0]?.id ??
        null;
      setActiveBranchIdState(fallback);
    }
  }, [activeBranchId, accessibleBranches, assignments, isRestricted, branchesLoading, assignmentsLoading]);

  useEffect(() => {
    if (activeBranchId) localStorage.setItem(STORAGE_KEY, activeBranchId);
    else localStorage.removeItem(STORAGE_KEY);
  }, [activeBranchId]);

  const value: BranchContextType = {
    branches,
    activeBranches: branches.filter((b) => b.is_active),
    activeBranchId,
    activeBranch: branches.find((b) => b.id === activeBranchId) ?? null,
    setActiveBranchId: setActiveBranchIdState,
    isRestricted,
    accessibleBranches,
    canAccessBranch: (branchId) =>
      !isRestricted || accessibleBranches.some((b) => b.id === branchId),
    loading: branchesLoading || assignmentsLoading,
  };

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export const useBranchContext = () => useContext(BranchContext);
