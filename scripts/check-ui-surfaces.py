#!/usr/bin/env python3
"""
check-ui-surfaces.py — Route-parity checker for L2-UI-SURFACE-MANIFEST-1.

Extracts routes from app/src/App.tsx, matches them against declared patterns
in config/ui/surfaces.yaml, and produces:
  1. A census line: ROUTES=<n> DECLARED=<m> MISSING=<k> PHANTOM=<p> CATCHALL=<c>
     REDIRECT=<r> SLOT-HOST=<s>
  2. Per-item detail for MISSING and PHANTOM
  3. An orphan-component artifact (deliverables/ui-surface-manifest-1/orphans.txt)

Exit 1 only when PHANTOM > 0 or a lazy specifier fails to resolve.
Exit 0 with MISSING > 0 is expected (3-entry manifest vs 41-route table).

No hardcoded route lists, surface ids, or orphan names — everything is extracted.
Only stdlib + PyYAML (falls back to hand-parsing if unavailable).
"""

import os
import re
import sys

SCRIPT_VERSION = "1.0.0"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_TSX = os.path.join(REPO_ROOT, "app", "src", "App.tsx")
SURFACES_YAML = os.path.join(REPO_ROOT, "config", "ui", "surfaces.yaml")
ORPHANS_DIR = os.path.join(REPO_ROOT, "deliverables", "ui-surface-manifest-1")
ORPHANS_FILE = os.path.join(ORPHANS_DIR, "orphans.txt")

# Module-scope list for unresolved imports
unresolved_imports = []

# ---------------------------------------------------------------------------
# YAML loader — prefer PyYAML, fall back to hand-parsing
# ---------------------------------------------------------------------------

def load_yaml(path):
    """Return parsed YAML dict. Falls back to hand-parsed surfaces list."""
    try:
        import yaml
        with open(path, "r") as f:
            return yaml.safe_load(f)
    except ImportError:
        return _hand_parse_surfaces(path)
    except Exception as e:
        print(f"WARNING: yaml load failed ({e}), hand-parsing", file=sys.stderr)
        return _hand_parse_surfaces(path)


def _hand_parse_surfaces(path):
    """Minimal parser for the surfaces[] + route fields."""
    surfaces = []
    current = None
    with open(path, "r") as f:
        for line in f:
            stripped = line.rstrip()
            m = re.match(r'^\s{2}- id:\s*(\S+)', stripped)
            if m:
                if current:
                    surfaces.append(current)
                current = {"id": m.group(1)}
                continue
            if current and re.match(r'^\s{4}route:\s*', stripped):
                route_val = stripped.split("route:")[1].strip().strip('"').strip("'")
                current["route"] = route_val
    if current:
        surfaces.append(current)
    return {"surfaces": surfaces}


# ---------------------------------------------------------------------------
# Route extraction from App.tsx
# ---------------------------------------------------------------------------

def extract_routes(app_tsx_path):
    """
    Extract <Route path="..."> lines from App.tsx.
    Returns (all_route_paths, non_catchall_count, catchall_count).
    The catch-all '*' is included in all_route_paths.
    """
    with open(app_tsx_path, "r") as f:
        content = f.read()

    # Match <Route path="..." — space after Route excludes <Routes>
    route_pattern = re.compile(r'<Route\s+path="([^"]+)"')
    matches = route_pattern.findall(content)

    catchall_count = matches.count("*")
    return matches, len(matches), catchall_count


# ---------------------------------------------------------------------------
# Lazy import extraction and file resolution
# ---------------------------------------------------------------------------

def extract_lazy_specifiers(app_tsx_path):
    """
    Extract lazy(async () => import('./...')) specifiers.
    Returns list of (component_name, import_path, resolved_file_path).
    Raises SystemExit if any specifier does not resolve to a real file.
    """
    with open(app_tsx_path, "r") as f:
        content = f.read()

    lazy_pattern = re.compile(
        r"const\s+(\w+)\s*=\s*lazy\(async\s*\(\)\s*=>\s*import\(['\"](\.\./|\./|\w)([^'\"]+)['\"]\)"
    )
    matches = lazy_pattern.findall(content)

    results = []
    app_src = os.path.join(REPO_ROOT, "app", "src")
    for comp_name, _rest, spec_path in matches:
        resolved = os.path.join(app_src, spec_path.replace("/", os.sep))
        if not resolved.endswith(".tsx"):
            resolved = resolved + ".tsx"
        if not os.path.isfile(resolved):
            dir_resolved = resolved + "/index.tsx"
            if os.path.isfile(dir_resolved):
                resolved = dir_resolved
            else:
                print(f"ERROR: lazy specifier for {comp_name} "
                      f"import('{spec_path}') does not resolve: {resolved}",
                      file=sys.stderr)
                sys.exit(1)
        results.append((comp_name, spec_path, resolved))

    return results


# ---------------------------------------------------------------------------
# Route-to-element mapping
# ---------------------------------------------------------------------------

def build_route_element_map(app_tsx_path):
    """
    Build a map from route path strings to the component element name
    rendered inside <DeferredRoute><ComponentName /> for each route.
    Skips routes whose element is NOT wrapped in <DeferredRoute>.
    """
    with open(app_tsx_path, "r") as f:
        content = f.read()

    # Match <Route path="..." element={<DeferredRoute><ComponentName
    pattern = re.compile(
        r'<Route\s+path="([^"]+)"\s+element={<DeferredRoute><(\w+)'
    )
    route_to_elem = {}
    for path, elem in pattern.findall(content):
        route_to_elem[path] = elem

    return route_to_elem


# ---------------------------------------------------------------------------
# Non-page route element shapes: redirect / slot-host / catch-all
# ---------------------------------------------------------------------------

# Ordered shape table: the JSX marker decides the class, so any future
# <Navigate> or <Slot> route is classified without naming its path.
ELEMENT_SHAPE_RULES = (
    ("redirect", "<Navigate "),
    ("slot-host", "<Slot "),
)
CATCHALL_PATH = "*"


def extract_route_elements(app_tsx_path):
    """Map every <Route path="..."> to the JSX source of its element."""
    with open(app_tsx_path, "r") as f:
        content = f.read()
    pattern = re.compile(r'<Route\s+path="([^"]+)"\s+element=\{(.+?)\}\s*/>', re.DOTALL)
    return dict(pattern.findall(content))


def _component_body(app_content, name):
    """Return the source of a locally defined `function <name>(...) { ... }`."""
    m = re.search(r'function\s+%s\s*\([^)]*\)\s*\{(.*?)\n\}' % re.escape(name),
                  app_content, re.S)
    return m.group(1) if m else ""


def _shape_detail(class_name, element):
    if class_name == "redirect":
        m = re.search(r'to=(?:"([^"]*)"|\{(.+?)\}\s+replace)', element, re.S)
        if not m:
            target = "?"
        elif m.group(1) is not None:
            target = m.group(1)
        else:
            target = m.group(2) or "?"
        return f"<Navigate to={target!r}>"
    if class_name == "slot-host":
        m = re.search(r'name="([^"]+)"', element)
        return f'<Slot name="{m.group(1)}">' if m else "<Slot>"
    return "path '*' (router catch-all)"


def classify_non_page_routes(unmatched_routes, route_elements, app_content):
    """
    Classify unmatched routes whose element is not a lazy page module by the
    element shape found in App.tsx. First matching rule wins, so each route
    lands in exactly one class. Returns
    (redirects, slot_hosts, catchalls, remaining_page_routes).
    """
    redirects, slot_hosts, catchalls, remaining = [], [], [], []
    for route_path in unmatched_routes:
        # A multi-line element body (or a tag name followed by a newline) is
        # still the same shape; collapse layout whitespace before matching the
        # shape table so a reformatted <Navigate>/<Slot> cannot fall through to
        # the page bucket and silently undercount REDIRECT / SLOT-HOST.
        element = re.sub(r"\s+", " ", route_elements.get(route_path, "")).strip()
        shape = None
        if route_path == CATCHALL_PATH:
            shape = ("catch-all", _shape_detail("catch-all", element))
        else:
            for class_name, marker in ELEMENT_SHAPE_RULES:
                if marker in element:
                    shape = (class_name, _shape_detail(class_name, element))
                    break
            if shape is None:
                local = re.match(r'^<(\w+)\s*/>$', element)
                body = _component_body(app_content, local.group(1)) if local else ""
                if "<Navigate" in body:
                    shape = ("redirect", f"{local.group(1)} renders "
                             f"{_shape_detail('redirect', body)}")
        if shape is None:
            remaining.append(route_path)
        elif shape[0] == "redirect":
            redirects.append((route_path, shape[1]))
        elif shape[0] == "slot-host":
            slot_hosts.append((route_path, shape[1]))
        else:
            catchalls.append((route_path, shape[1]))
    return redirects, slot_hosts, catchalls, remaining


# ---------------------------------------------------------------------------
# Pattern matching: manifest route pattern vs App.tsx route path
# ---------------------------------------------------------------------------

def pattern_matches(pattern, path):
    """
    Check if a manifest route pattern matches an App.tsx route path.
    Pattern segments starting with : or ending with ? are wildcards.
    """
    pattern_parts = [p for p in pattern.split("/") if p]
    path_parts = [p for p in path.split("/") if p]

    if len(pattern_parts) != len(path_parts):
        return False

    for pp, ph in zip(pattern_parts, path_parts):
        if pp.startswith(":") or pp.endswith("?"):
            continue  # wildcard
        if pp == ph:
            continue
        return False
    return True


def match_routes_to_patterns(routes, declared_surfaces):
    """
    Match each route path against declared patterns.
    Returns (matched_routes, unmatched_routes, phantom_patterns).
    """
    patterns = [(s["id"], s["route"]) for s in declared_surfaces]

    matched_routes = set()
    unmatched_routes = []
    phantom_patterns = []

    for route_path in routes:
        for surf_id, pattern in patterns:
            if pattern_matches(pattern, route_path):
                matched_routes.add(route_path)
                break
        else:
            unmatched_routes.append(route_path)

    for surf_id, pattern in patterns:
        has_match = False
        for route_path in routes:
            if pattern_matches(pattern, route_path):
                has_match = True
                break
        if not has_match:
            phantom_patterns.append((surf_id, pattern))

    return matched_routes, unmatched_routes, phantom_patterns


# ---------------------------------------------------------------------------
# Orphan detection: import-graph over app/src/**/*.tsx and app/src/**/*.ts
# ---------------------------------------------------------------------------

def find_orphans():
    """
    Build the import graph over app/src/**/*.tsx and app/src/**/*.ts and find
    capitalised component modules that no reachable module imports.
    """
    app_src = os.path.join(REPO_ROOT, "app", "src")

    all_files = []
    for root_dir, dirs, files in os.walk(app_src):
        for fname in files:
            if fname.endswith(".tsx") and not fname.endswith(".test.tsx"):
                all_files.append(os.path.join(root_dir, fname))
            elif fname.endswith(".ts") and not fname.endswith(".test.ts"):
                all_files.append(os.path.join(root_dir, fname))

    scanned_count = len(all_files)

    import_map = {}
    import_pattern = re.compile(r"""from\s+['"](\.\S+)['"]""")
    lazy_import_pattern = re.compile(r"""import\(['"](\.\S+)['"]""")

    for fpath in all_files:
        imports = set()
        try:
            with open(fpath, "r") as f:
                content = f.read()
            for m in import_pattern.finditer(content):
                imports.add(m.group(1))
            for m in lazy_import_pattern.finditer(content):
                imports.add(m.group(1))
        except Exception:
            pass
        import_map[fpath] = imports

    def resolve_import(source_file, rel_path):
        # Vite raw/url imports carry a `?raw` / `?url` query; the module on
        # disk is the path before the query. A missing file still records a miss.
        rel_path = rel_path.split("?", 1)[0]
        dir_of_source = os.path.dirname(source_file)
        base = os.path.normpath(os.path.join(dir_of_source, rel_path))
        # NodeNext emits ".js" in import specifiers even for .tsx source files.
        # Strip the trailing ".js" so candidate probes hit the real file.
        if base.endswith(".js"):
            base = base[:-3]
        if os.path.isfile(base):
            return base
        if os.path.isfile(base + ".tsx"):
            return base + ".tsx"
        if os.path.isfile(base + "/index.tsx"):
            return base + "/index.tsx"
        if os.path.isfile(base + ".ts"):
            return base + ".ts"
        if os.path.isfile(base + "/index.ts"):
            return base + "/index.ts"
        # Record the miss instead of silently inventing a path
        unresolved_imports.append((source_file, rel_path))
        return base + ".tsx"

    imported_files = set()
    for source_file, rel_imports in import_map.items():
        for rel in rel_imports:
            resolved = resolve_import(source_file, rel)
            imported_files.add(resolved)

    orphans = []
    for fpath in all_files:
        basename = os.path.splitext(os.path.basename(fpath))[0]
        if basename[0].isupper() and fpath not in imported_files:
            orphans.append((fpath, scanned_count))

    return orphans, scanned_count


# ---------------------------------------------------------------------------
# Chat-surface classification for missing routes
# ---------------------------------------------------------------------------

def classify_missing_routes(unmatched_routes, route_to_elem, lazy_specs):
    """
    For each unmatched route, resolve its page module and check whether
    that module imports SurfaceChatBridge.
    Returns (chat_mounted_count, non_chat_count, chat_details, non_chat_details).
    """
    # Build component_name -> resolved_file map from lazy specs
    comp_to_file = {}
    for comp_name, spec_path, resolved in lazy_specs:
        comp_to_file[comp_name] = resolved

    chat_routes = []
    non_chat_routes = []

    for route_path in unmatched_routes:
        elem = route_to_elem.get(route_path)
        if not elem:
            non_chat_routes.append((route_path, "no element resolved"))
            continue
        resolved = comp_to_file.get(elem)
        if not resolved:
            non_chat_routes.append((route_path, f"no lazy import for {elem}"))
            continue
        try:
            with open(resolved, "r") as f:
                mod_content = f.read()
            if "SurfaceChatBridge" in mod_content:
                chat_routes.append((route_path, elem, resolved))
            else:
                non_chat_routes.append((route_path, elem, resolved))
        except FileNotFoundError:
            non_chat_routes.append((route_path, elem, f"file not found: {resolved}"))

    return chat_routes, non_chat_routes


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # (a) Extract routes from App.tsx
    all_routes, route_count, catchall = extract_routes(APP_TSX)

    # (b) Resolve lazy specifiers
    lazy_specs = extract_lazy_specifiers(APP_TSX)

    # (c) Load manifest and build route-to-element map
    manifest = load_yaml(SURFACES_YAML)
    declared_surfaces = manifest.get("surfaces", [])
    declared_count = len(declared_surfaces)
    route_to_elem = build_route_element_map(APP_TSX)

    # Assert non-zero denominators (non-vacuity)
    assert route_count > 0, f"ROUTES must be > 0, got {route_count}"
    assert declared_count > 0, f"DECLARED must be > 0, got {declared_count}"

    # (d) Match routes against declared patterns
    matched, unmatched, phantoms = match_routes_to_patterns(all_routes, declared_surfaces)
    missing_count = len(unmatched)
    phantom_count = len(phantoms)

    # (d2) Classify non-page element shapes (redirect / slot-host / catch-all)
    route_elements = extract_route_elements(APP_TSX)
    with open(APP_TSX, "r") as f:
        app_content = f.read()
    # Non-tautological guard: the bucket-sum assert below still holds when
    # extraction silently drops a route (it just moves it between buckets), so
    # require element coverage of every route the route extractor found.
    assert len(route_elements) == route_count, (
        f"extract_route_elements captured {len(route_elements)} of "
        f"{route_count} routes")
    redirects, slot_hosts, catchalls, page_routes = classify_non_page_routes(
        unmatched, route_elements, app_content)
    # Every MISSING route lands in exactly one bucket; nothing may vanish.
    assert (len(redirects) + len(slot_hosts) + len(catchalls) + len(page_routes)
            == missing_count), "route classification dropped a MISSING route"

    # (e) Print census (token order up to CATCHALL is grepped by readers)
    census = (f"ROUTES={route_count} DECLARED={declared_count} "
              f"MISSING={missing_count} PHANTOM={phantom_count} CATCHALL={catchall}"
              f" REDIRECT={len(redirects)} SLOT-HOST={len(slot_hosts)}")
    print(census)

    # Print per-item detail for MISSING
    if unmatched:
        print(f"\nMISSING routes ({missing_count}):")
        for r in sorted(unmatched):
            print(f"  - {r}")

    # Print per-item detail for PHANTOM
    if phantoms:
        print(f"\nPHANTOM patterns ({phantom_count}):")
        for sid, pat in phantoms:
            print(f"  - {sid}: {pat}")

    # Classify non-page routes by element shape (each lands in one class)
    print(f"\n--- Non-page route shapes ---")
    print(f"Rule: element shape in App.tsx decides redirect / slot-host / catch-all.")
    for label, entries in (("catch-all", catchalls), ("redirect", redirects),
                           ("slot-host", slot_hosts)):
        print(f"  {label}: {len(entries)}")
        for route_path, why in entries:
            print(f"    {route_path} — {why}")

    # Classify remaining (page) routes by chat-surface mount
    print(f"\n--- Missing route classification ---")
    print(f"Rule: resolve each route element to its page module, check for "
          f"'SurfaceChatBridge' in that module's source.")
    chat_routes, non_chat_routes = classify_missing_routes(
        page_routes, route_to_elem, lazy_specs
    )
    print(f"  Routes mounting a chat surface (SurfaceChatBridge): {len(chat_routes)}")
    for r, e, f_ in chat_routes:
        print(f"    {r} -> {e} ({f_})")
    print(f"  Routes without chat-surface mount: {len(non_chat_routes)}")
    for entry in non_chat_routes:
        if len(entry) == 2:
            print(f"    {entry[0]} — {entry[1]}")
        else:
            print(f"    {entry[0]} -> {entry[1]} ({entry[2]})")

    # (f) Generate orphans.txt
    os.makedirs(ORPHANS_DIR, exist_ok=True)
    orphans, scanned = find_orphans()
    with open(ORPHANS_FILE, "w") as f:
        f.write(f"# Orphan component report — generated by check-ui-surfaces.py v{SCRIPT_VERSION}\n")
        f.write(f"# Scanned {scanned} .tsx + .ts modules (excluding .test.tsx / .test.ts)\n")
        f.write(f"# Total orphans: {len(orphans)}\n")
        f.write("# Rule: a capitalised component module is orphaned if no other "
                "scanned module imports it.\n")
        f.write("\n")
        for opath, _count in sorted(orphans):
            rel = opath.replace(REPO_ROOT + "/", "")
            reason = f"no importer found among {scanned} scanned modules"
            f.write(f"{rel} — {reason}\n")

    print(f"\nOrphan artifact: {ORPHANS_FILE} ({len(orphans)} orphans, {scanned} scanned)")
    print(f"UNRESOLVED-IMPORTS={len(unresolved_imports)}", file=sys.stderr)

    # Exit code: 1 only on PHANTOM > 0 (unresolved lazy already exits in (b))
    if phantom_count > 0:
        print(f"\nEXITING: PHANTOM={phantom_count} > 0", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
