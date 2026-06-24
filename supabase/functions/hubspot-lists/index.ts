// Fetch HubSpot Lists organized by folder for a given brand (primary account only).
//
// HubSpot lays out lists in the v3 lists API. Each list has a parentFolderId
// pointing at a folder; folder names are loosely brand-themed
// (e.g. "Swan Profiles", "AKER", "Bootz Profiles"). We:
//   1. List all folders via GET /crm/v3/lists/folders
//   2. Pick the folder whose name best matches the requested brand
//   3. Fetch lists inside that folder via POST /crm/v3/lists/search
//   4. Return name + size for each list

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ListsRequest {
  brandName: string;
}

interface HubSpotList {
  listId: string;
  name: string;
  size?: number;
  processingType?: string;
  additionalProperties?: { hs_list_size?: string; [k: string]: any };
}

interface HubSpotFolder {
  id: string;
  name: string;
  parentFolderId?: string | null;
}

async function hubspotFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HubSpot ${path}: ${res.status} ${err.slice(0, 200)}`);
  }
  return res.json();
}

// Folder-name → brand matching. The folder name usually contains the brand
// name (case-insensitive), sometimes with " Profiles" suffix. Returns the
// best-matching folder, or null.
function matchFolder(brandName: string, folders: HubSpotFolder[]): HubSpotFolder | null {
  const b = brandName.toLowerCase().trim();
  // Exact (case-insensitive) match wins.
  let m = folders.find((f) => f.name.toLowerCase().trim() === b);
  if (m) return m;
  // Then "<brand> Profiles" or "<brand> profiles".
  m = folders.find((f) => f.name.toLowerCase().trim() === `${b} profiles`);
  if (m) return m;
  // Then folder name starts with brand (handles "AKER", "MAAX 25" style).
  m = folders.find((f) => f.name.toLowerCase().trim().startsWith(b));
  if (m) return m;
  // Last resort: folder name contains brand as a whole word.
  m = folders.find((f) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(f.name));
  return m || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brandName } = (await req.json()) as ListsRequest;
    if (!brandName) {
      return new Response(JSON.stringify({ error: "brandName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "HUBSPOT_ACCESS_TOKEN not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Folder tree. HubSpot returns the full folder hierarchy in one call,
    // rooted at folder.id "0" with descendants under `childNodes` (recursive).
    const root = await hubspotFetch(`/crm/v3/lists/folders`, token);
    const folders: HubSpotFolder[] = [];
    function walk(node: any) {
      if (!node) return;
      // Skip the synthetic root (id="0", name=null).
      if (node.id && node.id !== "0" && node.name) {
        folders.push({
          id: String(node.id),
          name: String(node.name),
          parentFolderId: node.parentFolderId != null ? String(node.parentFolderId) : null,
        });
      }
      for (const child of node.childNodes || []) walk(child);
    }
    walk(root.folder ?? root);

    const folder = matchFolder(brandName, folders);
    if (!folder) {
      return new Response(
        JSON.stringify({
          brandName,
          folder: null,
          lists: [],
          message: `No HubSpot folder matched brand "${brandName}".`,
          debug: {
            totalFolders: folders.length,
            folderNames: folders.map((f) => f.name),
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Lists inside that folder. The v3 search endpoint doesn't filter by
    // folder directly, so we pull all lists and filter client-side by
    // parentFolderId. Lists carry `additionalProperties.hs_folder_id` and
    // `additionalProperties.hs_list_size`.
    const PAGE_SIZE = 500;
    const allLists: HubSpotList[] = [];
    let offset = 0;
    for (let i = 0; i < 30; i++) {
      const searchBody = {
        additionalProperties: ["hs_list_size", "hs_folder_id", "hs_processing_type"],
        offset,
        count: PAGE_SIZE,
      };
      const search = await hubspotFetch(`/crm/v3/lists/search`, token, {
        method: "POST",
        body: JSON.stringify(searchBody),
      });
      const page: HubSpotList[] = search.lists || [];
      allLists.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
    }

    const lists = allLists
      .filter((l) => {
        const folderId = l.additionalProperties?.hs_folder_id ?? (l as any).folderId;
        return folderId != null && String(folderId) === folder.id;
      })
      .map((l) => {
      const sizeRaw =
        l.size ??
        (l.additionalProperties?.hs_list_size
          ? Number(l.additionalProperties.hs_list_size)
          : undefined);
      return {
        listId: l.listId,
        name: l.name,
        size: typeof sizeRaw === "number" && !Number.isNaN(sizeRaw) ? sizeRaw : null,
        processingType:
          l.processingType ?? l.additionalProperties?.hs_processing_type ?? null,
      };
    });

    return new Response(
      JSON.stringify({
        brandName,
        folder: { id: folder.id, name: folder.name },
        lists,
        totalContacts: lists.reduce((sum, l) => sum + (l.size || 0), 0),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("hubspot-lists error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
