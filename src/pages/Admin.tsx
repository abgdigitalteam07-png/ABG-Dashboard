import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_DOMAINS } from "@/lib/allowed-domains";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Users, UserCheck, UserX, Activity, MoreHorizontal,
  Send, Download, ChevronLeft, ChevronRight, BarChart2, Eye, LogIn,
  Mail, Plus, Trash2, Calendar, Clock, ToggleLeft, ToggleRight, Play, Shield,
} from "lucide-react";
import { brands } from "@/lib/brands";
import { format, formatDistanceToNow, subDays, eachDayOfInterval, startOfDay } from "date-fns";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  domain: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  invited_by: string | null;
}

interface ActivityEntry {
  id: string;
  user_id: string | null;
  email: string;
  action: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loginsLast7, setLoginsLast7] = useState(0);
  const [activeAdminTab, setActiveAdminTab] = useState<"users" | "usage" | "schedules" | "access">("users");

  // ── Tab Access Permissions state ───────────────────────────────────────────
  interface TabPermRow { user_id: string; tab_id: string; can_view: boolean; show_insights: boolean; }
  const [tabPermissions, setTabPermissions] = useState<TabPermRow[]>([]);
  const [permSaving, setPermSaving] = useState<string | null>(null);

  // ── Report Schedules state ─────────────────────────────────────────────
  interface EmailSchedule {
    id: string;
    brand_id: string;
    brand_name: string;
    recipients: string[];
    day_of_week: number;
    send_hour_utc: number;
    date_range_days: number;
    is_active: boolean;
    last_sent_at: string | null;
    created_at: string;
  }
  const [schedules, setSchedules] = useState<EmailSchedule[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const [newSched, setNewSched] = useState({
    brand_id: "", brand_name: "",
    recipients: "mali@americanbathgroup.com",
    day_of_week: 1,           // Monday
    send_hour_utc: 8,
    date_range_days: 7,
    is_active: true,
  });
  const [schedSaving, setSchedSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");

  // Activity filters
  const [activityUserFilter, setActivityUserFilter] = useState("all");
  const [activityActionFilter, setActivityActionFilter] = useState("all");
  const [activityPage, setActivityPage] = useState(1);
  const activityPerPage = 25;

  // Invite form
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; description: string; variant?: "destructive";
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Sort — newest last login first by default
  const [sortCol, setSortCol] = useState<string>("last_login_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    const { data: profiles } = await supabase.from("user_profiles").select("*");
    if (profiles) setUsers(profiles as UserProfile[]);

    const { data: invites } = await supabase.from("user_invitations").select("*").eq("status", "pending");
    if (invites) setInvitations(invites as Invitation[]);

    const { data: logs } = await supabase
      .from("user_activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (logs) setActivity(logs as ActivityEntry[]);

    // Logins last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { count } = await supabase
      .from("user_activity_log")
      .select("*", { count: "exact", head: true })
      .eq("action", "login")
      .gte("created_at", sevenDaysAgo.toISOString());
    setLoginsLast7(count || 0);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate("/login", { replace: true }); return; }
      if (session.user.email !== "mali@americanbathgroup.com") {
        navigate("/", { replace: true });
        return;
      }
      setIsAdmin(true);
      fetchData();
    });
  }, [navigate, fetchData]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const domains = useMemo(() => [...new Set(users.map((u) => u.domain))].sort(), [users]);

  const filteredUsers = useMemo(() => {
    let list = [...users];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((u) => u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    if (statusFilter === "active") {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      list = list.filter((u) => u.is_active && !!u.last_login_at && new Date(u.last_login_at).getTime() >= cutoff);
    }
    if (statusFilter === "inactive") {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      list = list.filter((u) => u.is_active && !!u.last_login_at && new Date(u.last_login_at).getTime() < cutoff);
    }
    if (statusFilter === "never") list = list.filter((u) => u.is_active && !u.last_login_at);
    if (statusFilter === "deactivated") list = list.filter((u) => !u.is_active);
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    if (domainFilter !== "all") list = list.filter((u) => u.domain === domainFilter);
    list.sort((a, b) => {
      const av = (a as any)[sortCol] ?? "";
      const bv = (b as any)[sortCol] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [users, searchQuery, statusFilter, roleFilter, domainFilter, sortCol, sortDir]);

  const filteredActivity = useMemo(() => {
    let list = [...activity];
    if (activityUserFilter !== "all") list = list.filter((a) => a.email === activityUserFilter);
    if (activityActionFilter !== "all") list = list.filter((a) => a.action === activityActionFilter);
    return list;
  }, [activity, activityUserFilter, activityActionFilter]);

  // Latest login/logout event per email — best-effort proxy for "currently signed in"
  // (we don't track live session tokens, only login/logout actions in the activity log).
  const sessionStatusByEmail = useMemo(() => {
    const map = new Map<string, "in" | "out">();
    for (const a of activity) {
      if (a.action !== "login" && a.action !== "logout") continue;
      if (map.has(a.email)) continue; // activity is already ordered newest-first
      map.set(a.email, a.action === "login" ? "in" : "out");
    }
    return map;
  }, [activity]);

  const activityTotalPages = Math.max(1, Math.ceil(filteredActivity.length / activityPerPage));
  const paginatedActivity = filteredActivity.slice((activityPage - 1) * activityPerPage, activityPage * activityPerPage);

  const handleInvite = async () => {
    const trimmedEmail = inviteEmail.trim().toLowerCase();
    if (!trimmedEmail || !inviteName.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" }); return;
    }
    const domain = trimmedEmail.split("@")[1];
    if (!ALLOWED_DOMAINS.includes(domain)) {
      toast({ title: "Email domain not allowed", description: "Only ABG employee domains are permitted.", variant: "destructive" }); return;
    }
    if (users.find((u) => u.email === trimmedEmail)) {
      toast({ title: "User already has an account", variant: "destructive" }); return;
    }
    if (invitations.find((i) => i.email === trimmedEmail)) {
      toast({ title: "An invitation is already pending for this email", variant: "destructive" }); return;
    }

    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: trimmedEmail, full_name: inviteName.trim(), role: inviteRole }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to send invite");
      toast({ title: `Invitation sent to ${trimmedEmail}` });
      setInviteName(""); setInviteEmail(""); setInviteRole("viewer");
      fetchData();
    } catch (err: any) {
      toast({ title: "Error sending invite", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleDeactivate = async (user: UserProfile) => {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("user_profiles").update({
      is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: session!.user.id,
    }).eq("id", user.id);
    await supabase.from("user_activity_log").insert({
      user_id: session!.user.id, email: session!.user.email || "", action: "deactivated",
      metadata: { target_email: user.email, target_name: user.full_name },
    });
    toast({ title: `${user.full_name || user.email} deactivated` });
    fetchData();
  };

  const handleReactivate = async (user: UserProfile) => {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("user_profiles").update({
      is_active: true, deactivated_at: null, deactivated_by: null,
    }).eq("id", user.id);
    await supabase.from("user_activity_log").insert({
      user_id: session!.user.id, email: session!.user.email || "", action: "reactivated",
      metadata: { target_email: user.email },
    });
    toast({ title: `${user.full_name || user.email} reactivated` });
    fetchData();
  };

  const handleRoleChange = async (user: UserProfile, newRole: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("user_profiles").update({ role: newRole }).eq("id", user.id);
    await supabase.from("user_activity_log").insert({
      user_id: session!.user.id, email: session!.user.email || "", action: "role_changed",
      metadata: { target_email: user.email, from: user.role, to: newRole },
    });
    toast({ title: `${user.full_name || user.email} role changed to ${newRole}` });
    fetchData();
  };

  const exportCSV = () => {
    const headers = ["Timestamp", "User", "Action", "Details"];
    const rows = filteredActivity.map((a) => [
      format(new Date(a.created_at), "MMM d, yyyy, h:mm a"),
      a.email,
      a.action,
      a.metadata ? JSON.stringify(a.metadata) : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "activity-log.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const actionBadge = (action: string) => {
    const map: Record<string, { label: string; className: string }> = {
      login: { label: "Login", className: "bg-green-100 text-green-700" },
      logout: { label: "Logout", className: "bg-red-100 text-red-700" },
      page_view: { label: "Page View", className: "bg-blue-100 text-blue-700" },
      session_expired: { label: "Session Expired", className: "bg-yellow-100 text-yellow-700" },
      deactivated: { label: "Deactivated", className: "bg-gray-800 text-gray-100" },
      reactivated: { label: "Reactivated", className: "bg-green-100 text-green-700" },
      invited: { label: "Invited", className: "bg-purple-100 text-purple-700" },
      role_changed: { label: "Role Changed", className: "bg-orange-100 text-orange-700" },
    };
    const m = map[action] || { label: action, className: "bg-muted text-muted-foreground" };
    return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.className}`}>{m.label}</span>;
  };

  const metadataDetail = (action: string, metadata: Record<string, any> | null) => {
    if (!metadata) return "—";
    if (action === "page_view") return `Tab: ${metadata.tab || "—"}, Brand: ${metadata.brand || "—"}`;
    if (action === "role_changed") return `Role: ${metadata.from} → ${metadata.to}`;
    if (action === "invited") return `Invited: ${metadata.invited_email} (${metadata.assigned_role})`;
    if (action === "deactivated") return `Deactivated: ${metadata.target_email}`;
    return "—";
  };

  const last30Days = useMemo(() => {
    const today = startOfDay(new Date());
    return eachDayOfInterval({ start: subDays(today, 29), end: today }).reverse();
  }, []);

  // Per-day breakdown: date → { unique users, total views, logins, rows }
  const dailyUsage = useMemo(() => {
    return last30Days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayEntries = activity.filter((a) => a.created_at.startsWith(dayStr));
      const views = dayEntries.filter((a) => a.action === "page_view");
      const logins = dayEntries.filter((a) => a.action === "login");
      const uniqueUsers = [...new Set(dayEntries.map((a) => a.email))];
      return { day, dayStr, views, logins, uniqueUsers };
    });
  }, [activity, last30Days]);

  // Per-user summary
  const userUsage = useMemo(() => {
    const map: Record<string, { email: string; logins: number; views: number; lastSeen: string; brands: Set<string>; tabs: Set<string> }> = {};
    for (const a of activity) {
      if (!map[a.email]) map[a.email] = { email: a.email, logins: 0, views: 0, lastSeen: a.created_at, brands: new Set(), tabs: new Set() };
      const u = map[a.email];
      if (a.action === "login") u.logins++;
      if (a.action === "page_view") {
        u.views++;
        if (a.metadata?.brand) u.brands.add(a.metadata.brand);
        if (a.metadata?.tab) u.tabs.add(a.metadata.tab);
      }
      if (a.created_at > u.lastSeen) u.lastSeen = a.created_at;
    }
    return Object.values(map).sort((a, b) => b.views - a.views);
  }, [activity]);

  // ── Tab Access helpers ────────────────────────────────────────────────────
  async function loadTabPermissions() {
    const { data } = await supabase.from("user_tab_permissions").select("*");
    setTabPermissions(data ?? []);
  }

  async function upsertPerm(userId: string, tabId: string, field: "can_view" | "show_insights", value: boolean) {
    const key = `${userId}:${tabId}:${field}`;
    setPermSaving(key);
    // Optimistic update
    setTabPermissions(prev => {
      const existing = prev.find(p => p.user_id === userId && p.tab_id === tabId);
      if (existing) return prev.map(p => p.user_id === userId && p.tab_id === tabId ? { ...p, [field]: value } : p);
      return [...prev, { user_id: userId, tab_id: tabId, can_view: true, show_insights: true, [field]: value }];
    });
    await supabase.from("user_tab_permissions").upsert(
      { user_id: userId, tab_id: tabId, [field]: value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,tab_id" }
    );
    setPermSaving(null);
  }

  function getEffectivePerm(userId: string, tabId: string): { can_view: boolean; show_insights: boolean } {
    const row = tabPermissions.find(p => p.user_id === userId && p.tab_id === tabId);
    return { can_view: row?.can_view ?? true, show_insights: row?.show_insights ?? true };
  }

  // ── Schedule helpers ─────────────────────────────────────────────────────
  async function loadSchedules() {
    setSchedLoading(true);
    const { data } = await supabase.from("email_schedules").select("*").order("created_at", { ascending: false });
    setSchedules(data ?? []);
    setSchedLoading(false);
  }

  async function saveSchedule() {
    if (!newSched.brand_id || !newSched.recipients.trim()) {
      toast({ title: "Missing fields", description: "Select a brand and add at least one recipient email.", variant: "destructive" });
      return;
    }
    const recipientList = newSched.recipients.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
    if (!recipientList.length) {
      toast({ title: "Invalid emails", description: "Enter at least one valid email address.", variant: "destructive" });
      return;
    }
    setSchedSaving(true);
    const { error } = await supabase.from("email_schedules").insert({
      brand_id: newSched.brand_id,
      brand_name: newSched.brand_name,
      recipients: recipientList,
      day_of_week: newSched.day_of_week,
      send_hour_utc: newSched.send_hour_utc,
      date_range_days: newSched.date_range_days,
      is_active: newSched.is_active,
    });
    setSchedSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Schedule saved", description: `Report scheduled for ${newSched.brand_name}` });
    setNewSched({ brand_id: "", brand_name: "", recipients: "mali@americanbathgroup.com", day_of_week: 1, send_hour_utc: 8, date_range_days: 7, is_active: true });
    loadSchedules();
  }

  async function toggleSchedule(id: string, current: boolean) {
    await supabase.from("email_schedules").update({ is_active: !current }).eq("id", id);
    setSchedules(s => s.map(x => x.id === id ? { ...x, is_active: !current } : x));
  }

  async function deleteSchedule(id: string, brandName: string) {
    if (!confirm(`Delete schedule for ${brandName}?`)) return;
    await supabase.from("email_schedules").delete().eq("id", id);
    setSchedules(s => s.filter(x => x.id !== id));
    toast({ title: "Deleted", description: `Schedule for ${brandName} removed.` });
  }

  async function sendNow(id: string) {
    setSendingId(id);
    const { error } = await supabase.functions.invoke("send-scheduled-report", { body: { schedule_id: id } });
    setSendingId(null);
    if (error) { toast({ title: "Send failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Report sent!", description: "Email delivered to recipients." });
    loadSchedules();
  }

  const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const ACTIVE_WINDOW_DAYS = 30;
  const activeCutoff = Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const isRecentlyActive = (u: UserProfile) =>
    u.is_active && !!u.last_login_at && new Date(u.last_login_at).getTime() >= activeCutoff;
  const activeUsers = users.filter(isRecentlyActive).length;
  const deactivatedUsers = users.filter((u) => !u.is_active).length;
  const neverSignedIn = users.filter((u) => u.is_active && !u.last_login_at).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary px-6 py-4">
        <div className="flex items-center justify-between max-w-[1400px] mx-auto">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-primary-foreground hover:opacity-80 transition-opacity text-sm font-medium">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </button>
          <img src={ABG_LOGO_URL} className="w-[160px] h-auto" alt="ABG" />
          <div className="w-[140px]" />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
          {/* Tab switcher */}
          <div className="flex rounded-xl border border-border bg-muted/40 p-1 gap-1">
            {([
              { id: "users", label: "Users & Activity", icon: Users },
              { id: "usage", label: "Daily Usage", icon: BarChart2 },
              { id: "schedules", label: "Report Schedules", icon: Mail },
              { id: "access", label: "Tab Access", icon: Shield },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setActiveAdminTab(id);
                  if (id === "schedules") loadSchedules();
                  if (id === "access") loadTabPermissions();
                }}
                className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                  activeAdminTab === id
                    ? "bg-white shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* ══ DAILY USAGE TAB ══ */}
        {activeAdminTab === "usage" && (
          <div className="space-y-6">
            {/* Per-user summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> User Activity Summary (last 500 events)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>User</TableHead>
                      <TableHead className="text-center w-24">Logins</TableHead>
                      <TableHead className="text-center w-24">Page Views</TableHead>
                      <TableHead>Brands Viewed</TableHead>
                      <TableHead>Tabs Viewed</TableHead>
                      <TableHead>Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userUsage.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No activity recorded yet.</TableCell></TableRow>
                    ) : userUsage.map((u) => (
                      <TableRow key={u.email} className="hover:bg-muted/40">
                        <TableCell className="font-medium">{u.email}</TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                            <LogIn className="h-3 w-3" /> {u.logins}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                            <Eye className="h-3 w-3" /> {u.views}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                          {[...u.brands].join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[...u.tabs].join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Daily breakdown — last 30 days */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Daily Breakdown — Last 30 Days
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Date</TableHead>
                      <TableHead className="text-center">Unique Users</TableHead>
                      <TableHead className="text-center">Logins</TableHead>
                      <TableHead className="text-center">Page Views</TableHead>
                      <TableHead>Who was active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyUsage.map(({ day, dayStr, views, logins, uniqueUsers }) => (
                      <TableRow key={dayStr} className={`hover:bg-muted/40 ${uniqueUsers.length === 0 ? "opacity-40" : ""}`}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {format(day, "EEE, MMM d")}
                          {dayStr === format(new Date(), "yyyy-MM-dd") && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Today</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {uniqueUsers.length > 0 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 mx-auto">
                              {uniqueUsers.length}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center text-sm">{logins.length || "—"}</TableCell>
                        <TableCell className="text-center text-sm">{views.length || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[400px]">
                          {uniqueUsers.length > 0 ? uniqueUsers.join(", ") : "No activity"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ USERS & ACTIVITY TAB ══ */}
        {activeAdminTab === "users" && <>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Users", value: users.length, icon: Users },
            { label: "Active (30d)", value: activeUsers, icon: UserCheck },
            { label: "Never Signed In", value: neverSignedIn, icon: UserX },
            { label: "Logins (7 Days)", value: loginsLast7, icon: Activity },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Invite User */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Invite New User</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input placeholder="Full Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="sm:w-48" />
              <Input placeholder="email@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="sm:flex-1" />
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={inviting} className="sm:w-36">
                <Send className="h-4 w-4 mr-1" /> {inviting ? "Sending…" : "Send Invite"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* User Management Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">User Management</CardTitle>
            <div className="flex flex-wrap gap-3 pt-2">
              <Input placeholder="Search name or email…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-64" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active (last 30 days)</SelectItem>
                  <SelectItem value="inactive">Inactive (30+ days)</SelectItem>
                  <SelectItem value="never">Never signed in</SelectItem>
                  <SelectItem value="deactivated">Deactivated</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Select value={domainFilter} onValueChange={setDomainFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Domain" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  {domains.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {[
                      { key: "full_name", label: "Full Name" },
                      { key: "email", label: "Email" },
                      { key: "domain", label: "Domain" },
                      { key: "role", label: "Role" },
                      { key: "last_login_at", label: "Last Login" },
                      { key: "is_active", label: "Status" },
                    ].map(({ key, label }) => (
                      <TableHead key={key} className="cursor-pointer hover:bg-muted/60 select-none" onClick={() => handleSort(key)}>
                        {label} {sortCol === key && (sortDir === "asc" ? "↑" : "↓")}
                      </TableHead>
                    ))}
                    <TableHead>Session</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Pending invitations */}
                  {invitations.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-muted/60">
                      <TableCell>{inv.full_name || "—"}</TableCell>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell>{inv.email.split("@")[1]}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{inv.role}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">Never</TableCell>
                      <TableCell><Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">Pending</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">—</TableCell>
                      <TableCell>—</TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id} className="hover:bg-muted/60">
                      <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.domain}</TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          onValueChange={(newRole) => setConfirmDialog({
                            open: true,
                            title: newRole === "admin" ? "Make Admin" : "Make Member",
                            description: newRole === "admin"
                              ? `Give ${u.full_name || u.email} admin access?`
                              : `Remove admin access from ${u.full_name || u.email}?`,
                            onConfirm: () => handleRoleChange(u, newRole),
                          })}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="viewer">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true }) : "Never"}
                      </TableCell>
                      <TableCell>
                        {!u.is_active ? (
                          <Badge className="bg-red-100 text-red-700 border-red-300">Deactivated</Badge>
                        ) : !u.last_login_at ? (
                          <Badge className="bg-slate-100 text-slate-600 border-slate-300">Never signed in</Badge>
                        ) : isRecentlyActive(u) ? (
                          <Badge className="bg-green-100 text-green-700 border-green-300">Active</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-300">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {sessionStatusByEmail.get(u.email) === "in" ? (
                          <Badge className="bg-green-100 text-green-700 border-green-300">Signed in</Badge>
                        ) : sessionStatusByEmail.get(u.email) === "out" ? (
                          <Badge className="bg-slate-100 text-slate-600 border-slate-300">Signed out</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {u.is_active ? (
                              <DropdownMenuItem onClick={() => setConfirmDialog({
                                open: true, title: "Deactivate User",
                                description: `Deactivate ${u.full_name || u.email}? They will be unable to access the dashboard.`,
                                variant: "destructive", onConfirm: () => handleDeactivate(u),
                              })}>Deactivate</DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleReactivate(u)}>Reactivate</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Activity Log */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Activity Log</CardTitle>
              <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Select value={activityUserFilter} onValueChange={(v) => { setActivityUserFilter(v); setActivityPage(1); }}>
                <SelectTrigger className="w-56"><SelectValue placeholder="All Users" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {[...new Set(activity.map((a) => a.email))].sort().map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activityActionFilter} onValueChange={(v) => { setActivityActionFilter(v); setActivityPage(1); }}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All Actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {["login", "logout", "page_view", "invited", "deactivated", "reactivated", "role_changed"].map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedActivity.map((a) => (
                    <TableRow key={a.id} className="hover:bg-muted/60">
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(a.created_at), "MMM d, yyyy, h:mm a")}</TableCell>
                      <TableCell className="text-sm">{a.email}</TableCell>
                      <TableCell>{actionBadge(a.action)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{metadataDetail(a.action, a.metadata)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">Page {activityPage} of {activityTotalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={activityPage <= 1} onClick={() => setActivityPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={activityPage >= activityTotalPages} onClick={() => setActivityPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </>}
        {/* ══ TAB ACCESS TAB ══ */}
        {activeAdminTab === "access" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> Tab Visibility Per User
                </CardTitle>
                <p className="text-xs text-muted-foreground pt-1">
                  Unchecking a tab hides it completely for that user. "Insights" sub-toggle only applies to the Summary Report tab.
                </p>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {(() => {
                  const TAB_COLS: { id: string; label: string }[] = [
                    { id: "readme",      label: "Read Me" },
                    { id: "performance", label: "Analytics" },
                    { id: "social",      label: "Social" },
                    { id: "hubspot",     label: "Emails" },
                    { id: "hubspot-crm", label: "CRM" },
                    { id: "summary",     label: "Summary" },
                  ];
                  const activeUsersList = users.filter(u => u.is_active);
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="w-52">User</TableHead>
                          {TAB_COLS.map(t => (
                            <TableHead key={t.id} className="text-center whitespace-nowrap">{t.label}</TableHead>
                          ))}
                          <TableHead className="text-center whitespace-nowrap border-l">Insights<br /><span className="text-[10px] font-normal text-muted-foreground">(Summary only)</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeUsersList.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={TAB_COLS.length + 2} className="py-8 text-center text-sm text-muted-foreground">
                              No active users found.
                            </TableCell>
                          </TableRow>
                        ) : activeUsersList.map(u => (
                          <TableRow key={u.id} className="hover:bg-muted/30">
                            <TableCell>
                              <div className="font-medium text-sm">{u.full_name || "—"}</div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </TableCell>
                            {TAB_COLS.map(t => {
                              const perm = getEffectivePerm(u.id, t.id);
                              const key = `${u.id}:${t.id}:can_view`;
                              return (
                                <TableCell key={t.id} className="text-center">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 cursor-pointer accent-primary"
                                    checked={perm.can_view}
                                    disabled={permSaving === key}
                                    onChange={e => upsertPerm(u.id, t.id, "can_view", e.target.checked)}
                                  />
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center border-l">
                              {(() => {
                                const perm = getEffectivePerm(u.id, "summary");
                                const key = `${u.id}:summary:show_insights`;
                                const summaryVisible = getEffectivePerm(u.id, "summary").can_view;
                                return (
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 cursor-pointer accent-primary disabled:opacity-30"
                                    checked={perm.show_insights}
                                    disabled={!summaryVisible || permSaving === key}
                                    title={!summaryVisible ? "Summary tab is hidden for this user" : "Show Insights section"}
                                    onChange={e => upsertPerm(u.id, "summary", "show_insights", e.target.checked)}
                                  />
                                );
                              })()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}

      </main>

      {/* ══ REPORT SCHEDULES TAB ══ */}
      {activeAdminTab === "schedules" && (
        <div className="space-y-6">

          {/* ── Setup status banner ── */}
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap gap-4 text-sm">
                {[
                  { label: "Resend.com API Key", status: "pending", note: "Add RESEND_API_KEY to Supabase Edge Function secrets" },
                  { label: "email_schedules table", status: "ready", note: "Migration created — run: supabase db push" },
                  { label: "send-scheduled-report Edge Function", status: "ready", note: "Deploy: supabase functions deploy send-scheduled-report" },
                  { label: "pg_cron job", status: "pending", note: "Enable in Supabase Dashboard → Database → Extensions → pg_cron, then run the SQL below" },
                ].map(({ label, status, note }) => (
                  <div key={label} className="flex items-start gap-2 min-w-[220px] flex-1">
                    <span className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${status === "ready" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <div>
                      <p className="font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{note}</p>
                    </div>
                  </div>
                ))}
              </div>
              <details className="mt-3">
                <summary className="text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground">pg_cron SQL — run once in Supabase SQL Editor</summary>
                <pre className="mt-2 rounded bg-muted px-3 py-2 text-xs overflow-x-auto text-foreground">{`select cron.schedule(
  'send-scheduled-reports',
  '0 * * * *',  -- every hour on the hour (UTC)
  $$
    select net.http_post(
      url := 'https://ffxhonryhaadyudpopvv.supabase.co/functions/v1/send-scheduled-report',
      headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    )
  $$
);`}</pre>
              </details>
            </CardContent>
          </Card>

          {/* ── Add new schedule ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4 text-brand-red" /> Add Report Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Brand */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand</label>
                  <Select
                    value={newSched.brand_id}
                    onValueChange={(val) => {
                      const b = brands.find(b => b.id === val);
                      setNewSched(s => ({ ...s, brand_id: val, brand_name: b?.name ?? val }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select brand…" /></SelectTrigger>
                    <SelectContent>
                      {brands.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date range */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Report Period</label>
                  <Select
                    value={String(newSched.date_range_days)}
                    onValueChange={(v) => setNewSched(s => ({ ...s, date_range_days: Number(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 14 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="60">Last 60 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Day of week */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Send Day</label>
                  <Select
                    value={String(newSched.day_of_week)}
                    onValueChange={(v) => setNewSched(s => ({ ...s, day_of_week: Number(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOW_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Hour UTC */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Send Time (UTC)</label>
                  <Select
                    value={String(newSched.send_hour_utc)}
                    onValueChange={(v) => setNewSched(s => ({ ...s, send_hour_utc: Number(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, "0")}:00 UTC {h >= 4 && h <= 12 ? `(${h - 4}:00 ET)` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Recipients */}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Recipients (comma-separated)</label>
                <Input
                  placeholder="brad@americanbathgroup.com, chris@americanbathgroup.com"
                  value={newSched.recipients}
                  onChange={e => setNewSched(s => ({ ...s, recipients: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {newSched.recipients ? `${newSched.recipients.split(",").filter(e => e.trim()).length} recipient(s)` : "Add email addresses separated by commas"}
                </p>
              </div>

              <Button
                onClick={saveSchedule}
                disabled={schedSaving || !newSched.brand_id || !newSched.recipients.trim()}
                className="bg-brand-red hover:bg-brand-red/90 text-white"
              >
                {schedSaving ? "Saving…" : <><Plus className="h-4 w-4 mr-1" /> Save Schedule</>}
              </Button>
            </CardContent>
          </Card>

          {/* ── Existing schedules ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" /> Active Schedules
                <span className="ml-auto text-xs font-normal text-muted-foreground">{schedules.length} total</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {schedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : schedules.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No schedules yet. Add one above.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Last Sent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map(sched => (
                      <TableRow key={sched.id}>
                        <TableCell className="font-semibold">{sched.brand_name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {sched.recipients.map(r => (
                              <span key={r} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">{r}</span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {DOW_LABELS[sched.day_of_week]}s at {String(sched.send_hour_utc).padStart(2, "0")}:00 UTC
                        </TableCell>
                        <TableCell className="text-sm">Last {sched.date_range_days} days</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {sched.last_sent_at ? formatDistanceToNow(new Date(sched.last_sent_at), { addSuffix: true }) : "Never"}
                        </TableCell>
                        <TableCell>
                          <button onClick={() => toggleSchedule(sched.id, sched.is_active)} className="flex items-center gap-1 text-xs">
                            {sched.is_active
                              ? <><ToggleRight className="h-4 w-4 text-emerald-500" /><span className="text-emerald-600 font-medium">Active</span></>
                              : <><ToggleLeft className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Paused</span></>}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm" variant="outline"
                              disabled={sendingId === sched.id}
                              onClick={() => sendNow(sched.id)}
                              title="Send now"
                            >
                              {sendingId === sched.id
                                ? <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                                : <Play className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => deleteSchedule(sched.id, sched.brand_name)}
                              className="text-destructive hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((d) => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog((d) => ({ ...d, open: false }))}>Cancel</Button>
            <Button
              variant={confirmDialog.variant === "destructive" ? "destructive" : "default"}
              onClick={() => { confirmDialog.onConfirm(); setConfirmDialog((d) => ({ ...d, open: false })); }}
            >Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
