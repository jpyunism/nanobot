# Plan: Agenda (Calendario/Citas) en nanobot

## Resumen

Agregar una nueva surface "Agenda" al WebUI con una **grilla calendario mensual**,
persistencia en disco vía gateway (patrón **todos**, con funciones a nivel de módulo +
`WorkspaceScope`), y un **tool del agente** para que el LLM pueda gestionar las citas.

Cada cita tiene: `title`, `date` (YYYY-MM-DD), `time` (HH:MM | null), `all_day` (bool),
`description`, `category`, `color`, `created_at`, `updated_at`.

## Decisiones de diseño

- **Vista**: Grilla mensual tipo Google Calendar (días con puntos/marcas indicando
  citas) + lista detallada del día seleccionado + input para crear/editar abajo.
- **Patrón backend**: Funciones a nivel de módulo en `nanobot/webui/agenda_api.py`
  (mirror exacto de `nanobot/webui/todos_api.py`), NO una clase Controller.
  Storage: un único archivo `<workspace>/agenda/appointments.json` con una lista
  de citas. No requiere cambios en `gateway_services.py`.
- **Agente**: Tool `agenda` con acciones `add | list | update | delete`, modelado en
  `nanobot/agent/tools/cron.py`. Acceso al storage via `get_data_dir()` no aplica aquí
  (usa el workspace del request). **DECISIÓN**: el tool usará `default_workspace_scope`
  sobre el workspace del agente para leer/escribir el mismo `appointments.json`.
- **Sin nuevas dependencias JS**: usar `Date` nativo + `Intl.DateTimeFormat`
  (ya disponibles en `webui/src/lib/format.ts`). No hay `date-fns`/`dayjs` en el WebUI.

## Archivos nuevos (7)

| Archivo | Propósito |
|---------|-----------|
| `nanobot/webui/agenda_api.py` | Funciones CRUD de citas (mirror `todos_api.py`) |
| `nanobot/agent/tools/agenda.py` | Tool del LLM (mirror `cron.py`) |
| `tests/webui/test_agenda_api.py` | Tests del backend (mirror `test_todos_api.py`) |
| `tests/agent/tools/test_agenda_tool.py` | Tests del tool |
| `webui/src/lib/agenda-api.ts` | Cliente HTTP (mirror `todos-api.ts`) |
| `webui/src/hooks/useAgenda.ts` | Hook (mirror `useTodos.ts`) |
| `webui/src/components/agenda/AgendaSurface.tsx` | Componente vista + sub-componentes |

## Archivos a editar (≈14)

### Backend
- `nanobot/webui/ws_http.py` — imports de `agenda_api`, constantes de header,
  `_dispatch_agenda_routes`, `_agenda_scope`, `_handle_agenda_*` handlers.

### Frontend
- `webui/src/lib/routing.ts` — agregar `"agenda"` a `ShellView`, rama en `readShellRoute`
- `webui/src/lib/types.ts` — tipos `AgendaAppointment`
- `webui/src/components/shell/MainView.tsx` — import + rama de render
- `webui/src/components/Sidebar.tsx` — botón "Agenda" con icono `CalendarDays`
- `webui/src/hooks/useSidebarProps.ts` — wiring de `onOpenAgenda` + `activeUtility`
- `webui/src/hooks/useChatActions.ts` — `onOpenUtility` Extract + settingsSection
- `webui/src/hooks/useUtilityActions.ts` — `onOpenAgenda`
- `webui/src/hooks/useShellBootstrap.ts` — instanciar `useAgenda`, `onOpenAgenda`
- `webui/src/hooks/useDocumentTitle.ts` — rama `view === "agenda"`
- `webui/src/components/shell/AppShell.tsx` — pasar props al MainView

---

## Parte 1: Backend (Gateway Python)

### 1.1 Crear `nanobot/webui/agenda_api.py`

Mirror de `nanobot/webui/todos_api.py` (483 líneas). Modelo de datos: un único archivo
`<workspace>/agenda/appointments.json` con shape:

```json
{
  "appointments": [
    {
      "id": "uuid",
      "title": "Cita medica",
      "date": "2026-08-04",
      "time": "09:30",
      "all_day": false,
      "description": "Control anual",
      "category": "health",
      "color": "#ef4444",
      "created_at": "ISO",
      "updated_at": "ISO"
    }
  ]
}
```

**Constantes**:
- `AGENDA_DIR_NAME = "agenda"`
- `AGENDA_FILENAME = "appointments.json"`
- `AGENDA_APPOINTMENT_METADATA_KEY = "agenda_appointment"`
- `_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")`
- `_TIME_RE = re.compile(r"^\d{2}:\d{2}$")`
- `DEFAULT_CATEGORIES` dict con colores hex por categoría

**Helpers privados** (mirror de todos_api):
- `_now_iso()`, `_workspace_root(scope)`, `_agenda_dir(scope)`,
  `_resolve_agenda_dir(scope, create=False)` (jails via `resolve_allowed_path`),
  `_agenda_file(scope)`, `_atomic_write(path, data)`, `_read_json_file(path)`,
  `_is_valid_date(value)`, `_is_valid_time(value)`,
  `_normalize_appointment(raw)`, `_normalize_data(raw)`,
  `_read_agenda(scope)`, `_write_agenda(scope, data)`,
  `_validate_appointment_fields(appt)`, `_summary(appt)`

**Funciones públicas** (todas toman `scope: WorkspaceScope`, devuelven `{"error": ...}`
en fallo):
- `list_appointments(scope)` → `{"appointments": [summary, ...]}`
- `fetch_appointment(id, scope)` → `{"appointment": full}`
- `create_appointment(payload, scope)` → `{"appointment": full}`
- `update_appointment(id, changes, scope)` → `{"appointment": full}`
- `delete_appointment(id, scope)` → `{"ok": True, "id": id}`

### 1.2 Registrar endpoints HTTP en `nanobot/webui/ws_http.py`

**Imports** (después de línea 140, junto a los imports de `todos_api`):
```python
from nanobot.webui.agenda_api import (
    create_appointment as agenda_create_appointment,
)
from nanobot.webui.agenda_api import (
    delete_appointment as agenda_delete_appointment,
)
from nanobot.webui.agenda_api import (
    fetch_appointment as agenda_fetch_appointment,
)
from nanobot.webui.agenda_api import (
    list_appointments as agenda_list_appointments,
)
from nanobot.webui.agenda_api import (
    update_appointment as agenda_update_appointment,
)
```

**Constantes de header** (después de línea 164):
```python
_AGENDA_DATA_HEADER = "X-Nanobot-Agenda-Data"
_AGENDA_DATA_MAX_BYTES = 512 * 1024
```

**Dispatch caller** (después de línea 338, después del bloque de todos):
```python
# Agenda routes
response = self._dispatch_agenda_routes(request, got)
if response is not None:
    return response
```

**`_agenda_scope` helper** (mirror `_todo_scope` en línea 853-859):
```python
def _agenda_scope(self, request: WsRequest) -> WorkspaceScope:
    query = _parse_query(request.path)
    chat_id = _query_first(query, "chat_id")
    if chat_id:
        return self.workspaces.scope_for_session_key(f"websocket:{chat_id}")
    return self.workspaces.default_scope()
```

**`_dispatch_agenda_routes`** (después de `_dispatch_todo_routes`, ~línea 894):
```python
def _dispatch_agenda_routes(self, request: WsRequest, got: str) -> Response | None:
    if got == "/api/agenda":
        return self._handle_agenda_list(request)
    if got == "/api/agenda/create":
        return self._handle_agenda_create(request)
    m = re.match(r"^/api/agenda/([^/]+)$", got)
    if m:
        return self._handle_agenda_detail(request, m.group(1))
    m = re.match(r"^/api/agenda/([^/]+)/update$", got)
    if m:
        return self._handle_agenda_update(request, m.group(1))
    m = re.match(r"^/api/agenda/([^/]+)/delete$", got)
    if m:
        return self._handle_agenda_delete(request, m.group(1))
    return None
```

**Handlers** (mirror `_handle_todos_*` en líneas 896-1026):
- `_handle_agenda_list`: check_api_token → scope → `agenda_list_appointments` → respond
- `_handle_agenda_create`: check_api_token → `read_json_request_header(_AGENDA_DATA_HEADER, ...)` → `agenda_create_appointment` → respond
- `_handle_agenda_detail`: check_api_token → `agenda_fetch_appointment` → respond
- `_handle_agenda_update`: check_api_token → read header → `agenda_update_appointment` → respond
- `_handle_agenda_delete`: check_api_token → `agenda_delete_appointment` → respond

Cada handler: si `payload.get("error")` → `_http_error(400, payload["error"])`,
sino `_http_json_response(payload)`.

### 1.3 `gateway_services.py` — SIN CAMBIOS

El patrón todos no toca `gateway_services.py` (las funciones son importadas
directamente en `ws_http.py` y usan `self.workspaces` del handler para resolver el
scope). Agenda sigue el mismo patrón.

---

## Parte 2: Tool del Agente

### 2.1 Crear `nanobot/agent/tools/agenda.py`

Mirror de `nanobot/agent/tools/cron.py` (291 líneas). El tool se auto-registra via
`pkgutil` scan (nombre `agenda` no está en `_SKIP_MODULES`).

**Esquema de parámetros** (con `tool_parameters_schema`):
```python
_AGENDA_PARAMETERS = tool_parameters_schema(
    action=StringSchema("Action to perform", enum=["add", "list", "update", "delete"]),
    id=StringSchema("REQUIRED when action='update' or 'delete'. Appointment ID."),
    title=StringSchema("REQUIRED when action='add'. Short title."),
    date=StringSchema("REQUIRED when action='add'. Date as YYYY-MM-DD."),
    time=StringSchema("Time as HH:MM, or omit/null for all-day."),
    all_day=StringSchema("Set true for an all-day appointment (time becomes null)."),
    description=StringSchema("Longer description / notes."),
    category=StringSchema("Category: personal, work, health, reminder, journal, other."),
    color=StringSchema("Optional hex color (e.g. #ef4444). Defaults to category color."),
    required=["action"],
    description=("Action-specific parameters: add requires title+date; "
                 "update/delete require id."),
)
```

**Clase** (mirror `CronTool`):
```python
@tool_parameters(_AGENDA_PARAMETERS)
class AgendaTool(Tool):
    """Tool to manage calendar appointments."""

    def __init__(self, workspace: str, default_timezone: str = "UTC"):
        self._workspace = workspace
        self._default_timezone = default_timezone

    @classmethod
    def enabled(cls, ctx: Any) -> bool:
        return True  # always available

    @classmethod
    def create(cls, ctx: Any) -> Tool:
        return cls(workspace=ctx.workspace, default_timezone=ctx.timezone)

    @property
    def name(self) -> str:
        return "agenda"

    @property
    def description(self) -> str:
        return ("Manage calendar appointments: add, list, update, delete. "
                "Dates are YYYY-MM-DD; time is HH:MM or null for all-day.")

    def validate_params(self, params):
        errors = super().validate_params(params)
        action = params.get("action")
        if action == "add" and not str(params.get("title") or "").strip():
            errors.append("title is required when action='add'")
        if action in ("update", "delete") and not str(params.get("id") or "").strip():
            errors.append("id is required when action='update' or 'delete'")
        return errors

    async def execute(self, action, id=None, title=None, date=None,
                      time=None, all_day=False, description="",
                      category="other", color=None, **kwargs) -> str:
        scope = default_workspace_scope(self._workspace, restrict_to_workspace=True)
        if action == "add":
            return self._add(scope, title, date, time, all_day, description, category, color)
        elif action == "list":
            return self._list(scope)
        elif action == "update":
            return self._update(scope, id, {...})
        elif action == "delete":
            return self._delete(scope, id)
        return f"Unknown action: {action}"
```

**Helpers privados**: `_add`, `_list`, `_update`, `_delete` llaman a las funciones de
`agenda_api.py` con el scope y formatean el resultado como string para el LLM.

### 2.2 Tests `tests/agent/tools/test_agenda_tool.py`

Mirror de `tests/agent/tools/test_cron*.py`. Cubrir: cada acción, errores de
validación, formato de fecha, all_day.

---

## Parte 3: Frontend (WebUI React/TS)

### 3.1 Crear `webui/src/lib/agenda-api.ts`

Mirror de `webui/src/lib/todos-api.ts` (179 líneas).

```ts
const API_READ_TIMEOUT_MS = 20_000;
const AGENDA_DATA_HEADER = "X-Nanobot-Agenda-Data";

async function agendaRequest<T>(url, token, data?, base=""): Promise<T> {
  // GET method, JSON payload in header (mirror todoRequest)
}

export async function listAgendaAppointments(token, base?): Promise<AgendaListPayload>
export async function fetchAgendaAppointment(token, id, base?): Promise<AgendaDetailPayload>
export async function createAgendaAppointment(token, payload, base?): Promise<AgendaDetailPayload>
export async function updateAgendaAppointment(token, id, changes, base?): Promise<AgendaDetailPayload>
export async function deleteAgendaAppointment(token, id, base?): Promise<{ok: true, id: string}>
```

### 3.2 Crear `webui/src/hooks/useAgenda.ts`

Mirror de `webui/src/hooks/useTodos.ts` (363 líneas). Estado: `appointments`,
`loading`, `error`. API: `refresh`, `createAppt`, `updateAppt`, `deleteAppt`.
Polling cada 30s gated por `pageVisible`.

### 3.3 Crear `webui/src/components/agenda/AgendaSurface.tsx`

Surface dedicada (mirror de `TodosSurface.tsx`). Estructura:

```
┌─────────────────────────────────────────────┐
│ <AgendaHeader>   ‹  Agosto 2026  ›   Hoy     │
├─────────────────────────────────────────────┤
│ Lun Mar Mié Jue Vie Sáb Dom                  │
│   3   4   5   6   7   8   9   (puntos en     │
│  10  11  12  13  14  15  16   días con citas)│
│ ...                                          │
├─────────────────────────────────────────────┤
│ <AgendaDayDetail>  (citas del día seleccionado)│
├─────────────────────────────────────────────┤
│ <AgendaInput>  (form para crear/editar)       │
│   Título | Fecha | Hora | All-day | Categoría │
│   Descripción              [Guardar] [Cancelar]│
└─────────────────────────────────────────────┘
```

- **Calendario mensual**: construir la grilla con `Date` nativo (primer día del
  mes, días en la grilla 6x7). Reusar `activeLocale()` de `lib/format.ts` para
  los nombres de día/mes vía `Intl.DateTimeFormat`.
- **Marcas de cita**: punto de color bajo el número del día (`appointment.color`).
- **Navegación**: botones `‹` / `›` cambian el mes; "Hoy" vuelve al actual.
- **Input**: form con los campos (título requerido, fecha requerida, hora
  opcional con checkbox "Todo el día", categoría `<select>`, descripción `<textarea>`).

### 3.4 Routing — `webui/src/lib/routing.ts`

- Línea 11: agregar `| "agenda"` a `ShellView`.
- Después de línea 129 (rama de `/todos`): agregar
  ```ts
  if (path === "/agenda") return { view: "agenda", activeKey, settingsSection: "overview" };
  ```
- `shellRouteHash`: sin cambio (el `else` branch genera `#/agenda?chat=<key>`).

### 3.5 Tipos — `webui/src/lib/types.ts`

Después de la línea 1478 (bloque de todos):
```ts
// -- Agenda -------------------------------------------------------------------

export interface AgendaAppointment {
  id: string;
  title: string;
  date: string;          // "YYYY-MM-DD"
  time: string | null;   // "HH:MM" | null
  all_day: boolean;
  description: string;
  category: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface AgendaAppointmentSummary {
  id: string;
  title: string;
  date: string;
  time: string | null;
  all_day: boolean;
  category: string;
  color: string;
  updated_at: string;
}

export interface AgendaListPayload {
  appointments: AgendaAppointmentSummary[];
  error?: string;
}

export interface AgendaDetailPayload {
  appointment?: AgendaAppointment;
  error?: string;
}

export interface AgendaCreatePayload {
  title: string;
  date: string;
  time?: string | null;
  all_day?: boolean;
  description?: string;
  category?: string;
  color?: string;
}
```

### 3.6 Render dispatch — `webui/src/components/shell/MainView.tsx`

- Línea 25: agregar `| "agenda"` a `MainView` union.
- Import: `const AgendaSurface = lazy(() => import("@/components/agenda/AgendaSurface").then(m => ({ default: m.AgendaSurface })));`
- Después de la rama `todos` (líneas 143-149): agregar
  ```tsx
  ) : props.view === "agenda" ? (
    <Suspense fallback={props.fallback}>
      <AgendaSurface agenda={props.agenda} onBackToChat={props.onBackToChat} />
    </Suspense>
  ```

### 3.7 Sidebar — `webui/src/components/Sidebar.tsx`

- Importar `CalendarDays` de `lucide-react` (línea 1-13).
- Línea 46: agregar `onOpenAgenda?: () => void;` al interface.
- Línea 49: agregar `"agenda"` a la union `activeUtility`.
- Después de la línea 194 (botón de todos): insertar
  ```tsx
  {props.onOpenAgenda && (
    <SidebarActionButton
      collapsed={collapsed}
      label={t("sidebar.agenda", { defaultValue: "Agenda" })}
      onClick={props.onOpenAgenda}
      onIntent={props.onSettingsIntent}
      active={props.activeUtility === "agenda"}
      icon={<CalendarDays className="h-4 w-4" />}
    />
  )}
  ```

### 3.8 Hooks wiring

**`webui/src/hooks/useSidebarProps.ts`**:
- Línea 10: agregar `| "agenda"` a la union `view`.
- Línea 18: agregar `onOpenAgenda?: () => void;` a `Args`.
- Línea 63: agregar `onOpenAgenda: () => onOpenUtility("agenda"),`.
- Línea 66-74: agregar `view === "agenda" ||` a `activeUtility`.

**`webui/src/hooks/useChatActions.ts`**:
- Línea 51: agregar `"agenda"` al tipo `onOpen`.
- Línea 423: agregar `| "agenda"` al `Extract<ShellView, ...>`.
- Línea 428: el ternario de `settingsSection` ya cubre `agenda` via el
  default `view` (agenda → `"overview"`).

**`webui/src/hooks/useUtilityActions.ts`**:
- Línea 25: agregar `onOpenAgenda: () => void;` a `UtilityActions`.
- Línea 27, 41: agregar `"agenda"` al `Extract`.
- Línea 89: agregar `onOpenAgenda: () => openUtility("agenda"),`.

**`webui/src/hooks/useShellBootstrap.ts`**:
- Import `useAgenda` de `@/hooks/useAgenda`.
- Instanciar `const agenda = useAgenda();` (cerca de `const todos = useTodos(sessions)`).
- `onOpenAgenda` callback: `navigate({ view: "agenda", activeKey, settingsSection: "overview" })`.
- Pasar `onOpenAgenda` a `useSidebarProps` y al `useShellShortcuts`.
- Retornar `agenda, onOpenAgenda` en el shell object.

**`webui/src/components/shell/AppShell.tsx`**:
- Líneas 153-155: pasar `agenda={shell.agenda}` al `MainView`.

### 3.9 Document title — `webui/src/hooks/useDocumentTitle.ts`

- Línea 7: agregar `| "agenda"` a la union `view`.
- Después de la rama `todos` (líneas 51-56): agregar
  ```ts
  if (view === "agenda") {
    document.title = t("app.documentTitle.chat", {
      title: t("sidebar.agenda", { defaultValue: "Agenda" }),
    });
    return;
  }
  ```

### 3.10 i18n

No tocar archivos de locale — usar inline `defaultValue: "Agenda"` en todos los
`t("sidebar.agenda", { defaultValue: "Agenda" })` (igual que hace todos).

### 3.11 Shortcut (opcional)

`webui/src/hooks/useShellShortcuts.ts`: agregar `onOpenAgenda?` y un atajo
`Cmd/Ctrl+Shift+A` (mirror del `Cmd+Shift+T` de todos).

---

## Parte 4: Verificación

1. **Backend Python**:
   ```bash
   ruff check nanobot/
   pytest tests/webui/test_agenda_api.py tests/agent/tools/test_agenda_tool.py -v
   ```
2. **Frontend TS**:
   ```bash
   cd webui && bun run build
   cd webui && bun run test
   ```
3. **Gateway**:
   ```bash
   systemctl --user restart nanobot-gateway
   journalctl --user -u nanobot-gateway -n 50 --no-pager
   ```
4. **WebUI manual**: abrir `http://localhost:8765/`, verificar que aparece
   "Agenda" en el sidebar, crear una cita, recargar la página (persiste),
   navegar entre meses, y probar que el agente puede hacer `agenda list` /
   `agenda add` en un chat.

---

## Orden de implementación recomendado

1. `nanobot/webui/agenda_api.py` (backend core)
2. `tests/webui/test_agenda_api.py` (tests backend)
3. `nanobot/webui/ws_http.py` (HTTP routes)
4. `nanobot/agent/tools/agenda.py` (tool del agente)
5. `tests/agent/tools/test_agenda_tool.py` (tests tool)
6. `webui/src/lib/types.ts` + `webui/src/lib/agenda-api.ts` (tipos + API client)
7. `webui/src/hooks/useAgenda.ts` (hook)
8. `webui/src/components/agenda/AgendaSurface.tsx` (UI)
9. `webui/src/lib/routing.ts` + `MainView.tsx` + `Sidebar.tsx` + hooks (wiring)
10. `webui/src/hooks/useDocumentTitle.ts` + shortcuts (toques finales)
11. `ruff && pytest && bun build && systemctl restart` (verificación)