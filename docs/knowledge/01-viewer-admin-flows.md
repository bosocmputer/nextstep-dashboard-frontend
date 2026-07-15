---
status: current
last_verified: 2026-07-15
source_of_truth: [src/router/index.ts, src/utils/viewerRouting.ts, src/views/viewer/ViewerShell.vue, src/views/admin/ScheduleEditor.vue]
tags: [frontend, viewer, admin, routing]
---

# Viewer and Admin Flows

## Admin

The router protects every `/admin` child route with the admin session guard. Main workflows are:

- Tenant list and tenant detail
- SML connection and safe connection test
- Recipient invitation, status, report permissions, and permission dependencies
- LINE schedule creation/editing, preview, activation, pause, test send, archive, and restore
- Global report run, LINE delivery, and audit views

Permission and schedule selection are different concepts:

- Permission = reports a recipient may open in the tenant dashboard.
- Schedule report set = reports included in one LINE occurrence.
- Every selected recipient must have permission for every report selected by an active schedule.

## Viewer Entry

`ViewerShell.vue` initializes the viewer session, resolves invitation or delivery entry references, loads accessible tenants, and establishes navigation scope.

### `/app`

- Zero accessible tenants: show an empty state.
- One accessible tenant: may open it automatically.
- Multiple accessible tenants: show the chooser; do not select the first tenant silently.
- A tenant membership with no report permissions remains visible with an explanatory state.

### Tenant scope

Routes:

```text
/app/tenant/{tenantId}
/app/tenant/{tenantId}/report/{reportKey}
```

The menu is built from the current tenant report permissions. An explicit malformed or unauthorized tenant route becomes unavailable and must not display stale data from a previous tenant.

### Delivery scope

Routes:

```text
/app/tenant/{tenantId}/delivery/{deliveryId}
/app/tenant/{tenantId}/delivery/{deliveryId}/report/{reportKey}
```

The menu is built only from `DeliveryContext.reports`, preserving delivery order. It must not flash the wider tenant menu while context loads. A report absent from the delivery is rejected even when the recipient may open it in tenant scope. `ไป Dashboard ร้าน` exits delivery scope explicitly.

## Fail-closed Rules

- Clear previous tenant name, menus, KPI, charts, and delivery context before validating a new explicit route.
- Abort obsolete requests and use a generation/current-context guard before applying responses.
- Use the same generic unavailable message for missing and unauthorized resources.
- Recovery returns to `/app` only after the user requests it.
- Delivery routes load existing snapshots and never start report runs or revalidation automatically.
