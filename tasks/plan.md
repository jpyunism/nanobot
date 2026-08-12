# Plan: Check updates desde GitHub (madkoding/nanobot)

Spec: `docs/spec-check-updates-github.md`

## Componentes y dependencias

```
version_check.py (reescribir)
   └── depende de: nanobot.utils.update.get_remote_pyproject_version (ya existe)
   └── compara con packaging.version.Version (ya en deps)
        │
        ▼
settings_routes.py (SIN cambios — ya llama check_for_update)
        │
        ▼
webui/src/lib/api.ts (contrato: pypiUrl → githubUrl)
        │
        ▼
webui/src/components/settings/SettingsView.tsx (link "GitHub")
```

## Orden de implementación

1. **Backend**: reescribir `nanobot/webui/version_check.py`
   - Importar `get_remote_pyproject_version` de `nanobot.utils.update`
   - Mantener cache 5 min y silencio ante errores
   - Payload: `{currentVersion, latestVersion, githubUrl}` (nunca pypi.org)
2. **Tests backend**: crear `tests/webui/test_version_check.py` (TDD: primero el test)
3. **Frontend**: `webui/src/lib/api.ts` (interface) + `SettingsView.tsx` (link GitHub)
4. **Verificación**: pytest + ruff + build WebUI + vitest

## Riesgos y mitigaciones

- **Import de `nanobot.utils.update` arrastra `tiktoken`** (vía `utils/helpers`): es dependencia del proyecto, presente en el venv del gateway y de dev. Verificar con import smoke antes de implementar.
- **Contrato del endpoint cambia** (`pypiUrl` → `githubUrl`): es un cambio breaking del payload; el frontend se actualiza en el mismo PR, no hay consumidores externos conocidos.
- **Cache con valor `None`**: el cache actual solo guarda valores no-None; ante error de red se re-consulta en cada click (comportamiento actual, se mantiene).

## Verificaciones (checkpoints)

- [ ] `python -c "from nanobot.webui.version_check import check_for_update"` importa sin error
- [ ] `pytest tests/webui/test_version_check.py -v` verde
- [ ] `ruff check nanobot/webui/version_check.py` limpio
- [ ] `pytest tests/webui/test_settings_routes.py -v` (smoke endpoint)
- [ ] `cd webui && npm run build` verde
- [ ] `cd webui && npm run test` verde
- [ ] grep: `version_check.py` no contiene "pypi"
