import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_DOMAINS } from "@/lib/allowed-domains";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
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
  Filter, X,
} from "lucide-react";
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

type OnlineStatus = "online" | "recent" | "offline" | "never";

function getOnlineStatus(lastSeen: string | null): OnlineStatus {
  if (!lastSeen) return "never";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 15 * 60 * 1000) return "online";
  if (diff < 24 * 60 * 60 * 1000) return "recent";
  return "offline";
}

function OnlineDot({ status }: { status: OnlineStatus }) {
  const cfg = {
    online: { color: "bg-green-500", label: "Online now" },
    recent: { color: "bg-yellow-400", label: "Active today" },
    offline: { color: "bg-gray-300", label: "Offline" },
    never: { color: "bg-gray-200", label: "Never logged in" },
  }[status];
  return (
    <span className="flex items-center gap-1.5" title={cfg.label}>
      <span className={`inline-block h-2 w-2 rounded-full ${cfg.color} ${status === "online" ? "animate-pulse" : ""}`} />
      <span className="text-xs text-muted-foreground">{cfg.label}</span>
    </span>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loginsLast7, setLoginsLast7] = useState(0);
  const [activeAdminTab, setActiveAdminTab] = useState<"users" | "usage">("users");

  // User management filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");

  // Activity log filters
  const [activityUserFilter, setActivityUserFilter] = useState("all");
  const [activityActionFilter, setActivityActionFilter] = useState("all");
  const [activityPage, setActivityPage] = useState(1);
  const activityPerPage = 25;

  // Email multi-select filter for usage tab
  const [emailFilterMode, setEmailFilterMode] = useState<"include" | "exclude">("exclude");
  const [emailFilterSelected, setEmailFilterSelected] = useState<Set<string>>(new Set());
  const [emailFilterOpen, setEmailFilterOpen] = useState(false);

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

  // Sort
  const [sortCol, setSortCol] = useState<string>("created_at");
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
      setCurrentUserEmail(session.user.email || "");
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
    if (statusFilter === "active") list = list.filter((u) => u.is_active);
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

  const activityTotalPages = Math.max(1, Math.ceil(filteredActivity.length / activityPerPage));
  const paginatedActivity = filteredActivity.slice((activityPage - 1) * activityPerPage, activityPage * activityPerPage);

  // All known emails (profiles + current user + activity emails)
  const allKnownEmails = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => set.add(u.email));
    if (currentUserEmail) set.add(currentUserEmail);
    activity.forEach((a) => set.add(a.email));
    return [...set].sort();
  }, [users, currentUserEmail, activity]);

  // Per-user summary — includes every registered user + current user, even with zero activity
  const userUsage = useMemo(() => {
    const map: Record<string, {
      email: string; logins: number; views: number;
      lastSeen: string | null; brands: Set<string>; tabs: Set<string>;
    }> = {};

    // Seed from user_profiles so users with no activity still appear
    for (const u of users) {
      map[u.email] = {
        email: u.email, logins: 0, views: 0,
        lastSeen: u.last_login_at ?? null,
        brands: new Set(), tabs: new Set(),
      };
    }
    // Always include current admin user
    if (currentUserEmail && !map[currentUserEmail]) {
      map[currentUserEmail] = {
        email: currentUserEmail, logins: 0, views: 0,
        lastSeen: null, brands: new Set(), tabs: new Set(),
      };
    }
    // Fill in activity data
    for (const a of activity) {
      if (!map[a.email]) {
        map[a.email] = {
          email: a.email, logins: 0, views: 0,
          lastSeen: a.created_at, brands: new Set(), tabs: new Set(),
        };
      }
      const u = map[a.email];
      if (a.action === "login") u.logins++;
      if (a.action === "page_view") {
        u.views++;
        if (a.metadata?.brand) u.brands.add(a.metadata.brand);
        if (a.metadata?.tab) u.tabs.add(a.metadata.tab);
      }
      if (u.lastSeen === null || a.created_at > u.lastSeen) u.lastSeen = a.created_at;
    }
    return Object.values(map).sort((a, b) => {
      const sa = getOnlineStatus(a.lastSeen);
      const sb = getOnlineStatus(b.lastSeen);
      const order = { online: 0, recent: 1, offline: 2, never: 3 };
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      return b.views - a.views;
    });
  }, [activity, users, currentUserEmail]);

  // Apply email filter to user usage
  const filteredUserUsage = useMemo(() => {
    if (emailFilterSelected.size === 0) return userUsage;
    if (emailFilterMode === "include") return userUsage.filter((u) => emailFilterSelected.has(u.email));
    return userUsage.filter((u) => !emailFilterSelected.has(u.email));
  }, [userUsage, emailFilterMode, emailFilterSelected]);

  const toggleEmailFilter = (email: string) => {
    setEmailFilterSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  };

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

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const activeUsers = users.filter((u) => u.is_active).length;
  const deactivatedUsers = users.filter((u) => !u.is_active).length;
  const onlineNow = userUsage.filter((u) => getOnlineStatus(u.lastSeen) === "online").length;

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
          <div className="flex rounded-xl border border-border bg-muted/40 p-1 gap-1">
            {([
              { id: "users", label: "Users & Activity", icon: Users },
              { id: "usage", label: "Daily Usage", icon: BarChart2 },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveAdminTab(id)}
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
            {/* Email filter bar */}
            <div className="flex items-center gap-3 flex-wrap">
              <Popover open={emailFilterOpen} onOpenChange={setEmailFilterOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5" />
                    Filter by email
                    {emailFilterSelected.size > 0 && (
                      <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {emailFilterSelected.size}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3" align="start">
                  <div className="space-y-3">
                    {/* Mode toggle */}
                    <div className="flex items-center gap-2 rounded-lg border p-1">
                      <button
                        onClick={() => setEmailFilterMode("include")}
                        className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                          emailFilterMode === "include" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Show only selected
                      </button>
                      <button
                        onClick={() => setEmailFilterMode("exclude")}
                        className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                          emailFilterMode === "exclude" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Exclude selected
                      </button>
                    </div>

                    {/* Email list with checkboxes */}
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {allKnownEmails.map((email) => (
                        <label
                          key={email}
                          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60 cursor-pointer"
                        >
                          <Checkbox
                            checked={emailFilterSelected.has(email)}
                            onCheckedChange={() => toggleEmailFilter(email)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs truncate flex-1">{email}</span>
                          {email === currentUserEmail && (
                            <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">You</span>
                          )}
                        </label>
                      ))}
                      {allKnownEmails.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-3 text-center">No users yet</p>
                      )}
                    </div>

                    {/* Quick actions */}
                    <div className="flex gap-2 border-t pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => {
                          setEmailFilterSelected(new Set([currentUserEmail]));
                          setEmailFilterMode("exclude");
                        }}
                      >
                        Exclude me
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => setEmailFilterSelected(new Set())}
                      >
                        Clear all
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Active filter chips */}
              {emailFilterSelected.size > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {emailFilterMode === "include" ? "Showing:" : "Hiding:"}
                  </span>
                  {[...emailFilterSelected].map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                    >
                      {email}
                      <button onClick={() => toggleEmailFilter(email)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => setEmailFilterSelected(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Per-user summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Who's Logged In — All Users
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {onlineNow > 0 && (
                      <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                        {onlineNow} online now
                      </span>
                    )}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Status</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-center w-24">Logins</TableHead>
                      <TableHead className="text-center w-24">Page Views</TableHead>
                      <TableHead>Brands Viewed</TableHead>
                      <TableHead>Tabs Viewed</TableHead>
                      <TableHead>Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUserUsage.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No users match the current filter.
                        </TableCell>
                      </TableRow>
                    ) : filteredUserUsage.map((u) => {
                      const status = getOnlineStatus(u.lastSeen);
                      const isMe = u.email === currentUserEmail;
                      return (
                        <TableRow
                          key={u.email}
                          className={`hover:bg-muted/40 ${status === "never" ? "opacity-60" : ""}`}
                        >
                          <TableCell>
                            <OnlineDot status={status} />
                          </TableCell>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              {u.email}
                              {isMe && (
                                <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">You</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {u.logins > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                                <LogIn className="h-3 w-3" /> {u.logins}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {u.views > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                                <Eye className="h-3 w-3" /> {u.views}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                            {[...u.brands].join(", ") || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {[...u.tabs].join(", ") || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {u.lastSeen
                              ? formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true })
                              : <span className="text-xs italic text-muted-foreground/60">Never logged in</span>
                            }
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Daily breakdown */}
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
            { label: "Active Users", value: activeUsers, icon: UserCheck },
            { label: "Deactivated", value: deactivatedUsers, icon: UserX },
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
                  <SelectItem value="active">Active</SelectItem>
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
                      <TableCell>—</TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id} className="hover:bg-muted/60">
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {u.full_name || "—"}
                          {u.email === currentUserEmail && (
                            <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">You</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.domain}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{u.role}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.last_login_at ? (
                          <span title={format(new Date(u.last_login_at), "MMM d, yyyy, h:mm a")}>
                            {formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="italic text-muted-foreground/60 text-xs">Never logged in</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.is_active ? (
                          <Badge className="bg-green-100 text-green-700 border-green-300">Active</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 border-red-300">Deactivated</Badge>
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
                            {u.role === "viewer" && (
                              <DropdownMenuItem onClick={() => setConfirmDialog({
                                open: true, title: "Make Admin",
                                description: `Give ${u.full_name || u.email} admin access?`,
                                onConfirm: () => handleRoleChange(u, "admin"),
                              })}>Make Admin</DropdownMenuItem>
                            )}
                            {u.role === "admin" && (
                              <DropdownMenuItem onClick={() => setConfirmDialog({
                                open: true, title: "Remove Admin",
                                description: `Remove admin access from ${u.full_name || u.email}?`,
                                onConfirm: () => handleRoleChange(u, "viewer"),
                              })}>Remove Admin</DropdownMenuItem>
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
                    <SelectItem key={e} value={e}>{e}{e === currentUserEmail ? " (You)" : ""}</SelectItem>
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
                  {paginatedActivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No activity recorded yet. Activity will appear here as users log in and navigate the dashboard.
                      </TableCell>
                    </TableRow>
                  ) : paginatedActivity.map((a) => (
                    <TableRow key={a.id} className="hover:bg-muted/60">
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(a.created_at), "MMM d, yyyy, h:mm a")}</TableCell>
                      <TableCell className="text-sm">
                        <span className="flex items-center gap-1.5">
                          {a.email}
                          {a.email === currentUserEmail && (
                            <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">You</span>
                          )}
                        </span>
                      </TableCell>
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
      </main>

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
