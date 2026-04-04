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
  Send, Download, ChevronLeft, ChevronRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

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
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      if (profile?.role !== "admin") {
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

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const activeUsers = users.filter((u) => u.is_active).length;
  const deactivatedUsers = users.filter((u) => !u.is_active).length;

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
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>

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
                      <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.domain}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{u.role}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true }) : "Never"}
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
