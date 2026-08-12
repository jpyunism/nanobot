# Tasks: Check updates desde GitHub

Spec: `docs/spec-check-updates-github.md` · Plan: `tasks/plan.md`

## Tareas

- [ ] **T1: Reescribir `nanobot/webui/version_check.py`**
  - Acceptance: `check_for_update()` consulta `get_remote_pyproject_version()` (GitHub main), nunca pypi.org; mantiene cache 5 min; retorna `None` ante error de red/versión inválida/up-to-date; payload con `githubUrl`
  - Verify: `python -c "from nanobot.webui.version_check import check_for_update"` + grep sin "pypi"
  - Files: `nanobot/webui/version_check.py`

- [ ] **T2: Tests backend `tests/webui/test_version_check.py`**
  - Acceptance: cubre update disponible, up-to-date, remota menor, error de red, cache TTL, versión inválida (monkeypatch de `get_remote_pyproject_version`)
  - Verify: `pytest tests/webui/test_version_check.py -v` verde
  - Files: `tests/webui/test_version_check.py`

- [ ] **T3: Frontend — contrato `githubUrl`**
  - Acceptance: `VersionCheckResult` en `api.ts` usa `githubUrl`; `VersionCheckRow` muestra link "GitHub" apuntando a `githubUrl`
  - Verify: `cd webui && npm run build` + `npm run test` verdes
  - Files: `webui/src/lib/api.ts`, `webui/src/components/settings/SettingsView.tsx`

- [ ] **T4: Verificación final + PR**
  - Acceptance: pytest (nuevo + smoke settings_routes), ruff, build WebUI verdes; branch en fork; PR a madkoding/nanobot
  - Verify: checkpoints del plan completos
  - Files: — (git ops)
