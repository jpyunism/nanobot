# Spec: Check updates desde GitHub (madkoding/nanobot) en Settings → Overview

## Objective

El botón "Check for updates" de Settings → Overview (About) actualmente consulta PyPI
(`pypi.org/pypi/nanobot-ai/json`) para detectar versiones nuevas. Se quiere que consulte
GitHub (`madkoding/nanobot`, rama `main`) en su lugar, ya que el flujo de actualización
real del proyecto es git-based (ver `nanobot/utils/update.py`), no PyPI.

**Usuario**: operador del WebUI (self-hosted). **Éxito**: al hacer click en "Check for
updates", el resultado refleja si `main` de madkoding/nanobot tiene una versión más nueva
que la instalada, con link al repo de GitHub en vez de PyPI.

## Assumptions

1. La fuente de verdad de "última versión" es el `version` del `pyproject.toml` en
   `madkoding/nanobot@main` (misma fuente que ya usa `nanobot/utils/update.py` para el
   update flow). No se usan GitHub Releases (el repo no publica releases).
2. "Hay actualización" = versión remota > versión local (comparación semver con
   `packaging.version.Version`, dependencia ya existente). Si remota ≤ local → up to date.
3. Se reutilizan los helpers públicos de `nanobot/utils/update.py`
   (`get_remote_pyproject_version`) en vez de duplicar lógica HTTP en `version_check.py`.
4. Se mantiene el cache de 5 min y el comportamiento silencioso ante error de red
   (retorna `None` → UI muestra "up to date").
5. El payload del endpoint cambia `pypiUrl` → `githubUrl` (link a
   `https://github.com/madkoding/nanobot`). El texto del link en la UI pasa de "PyPI" a
   "GitHub".
6. No cambia el flujo de update en sí (`perform_update`), solo la detección.

## Tech Stack

- Python 3.11+, asyncio (backend)
- `httpx` (ya usado en `version_check.py`), `packaging>=24.0` (ya en deps)
- React 18 + TypeScript + Vite (WebUI)
- pytest (tests backend), vitest (tests WebUI)

## Commands

```bash
# Backend tests
pytest tests/webui/test_version_check.py -v

# Lint
ruff check nanobot/webui/version_check.py

# WebUI build + tests
cd webui && npm run build
cd webui && npm run test

# Full regression (smoke)
pytest tests/webui/test_settings_routes.py -v
```

## Project Structure

- `nanobot/webui/version_check.py` → reescrito: chequea GitHub vía `utils.update`
- `nanobot/webui/settings_routes.py` → sin cambios (ya llama `check_for_update`)
- `webui/src/lib/api.ts` → `VersionCheckResult`: `pypiUrl` → `githubUrl`
- `webui/src/components/settings/SettingsView.tsx` → `VersionCheckRow`: link "GitHub"
- `tests/webui/test_version_check.py` → nuevo, unit tests del checker

## Code Style

```python
# nanobot/webui/version_check.py
def check_for_update() -> dict[str, Any] | None:
    """Check madkoding/nanobot main for a newer version. Returns update info or None."""
    global _cache
    now = time.monotonic()
    cached_at, cached_val = _cache
    if now - cached_at < _CACHE_TTL_S and cached_val is not None:
        latest = cached_val
    else:
        latest = get_remote_pyproject_version()  # None on network error
        _cache = (now, latest)

    if not latest:
        return None
    try:
        remote = Version(latest)
        local = Version(__version__)
    except InvalidVersion:
        return None
    if remote <= local:
        return None
    return {
        "currentVersion": __version__,
        "latestVersion": latest,
        "githubUrl": GITHUB_REPO_URL,
    }
```

Convenciones: line length 100, ruff E/F/I/N/W, docstrings en inglés (idioma del repo),
nombres camelCase en payloads JSON (contrato WebUI).

## Testing Strategy

- **Unit (pytest)**: `tests/webui/test_version_check.py` — monkeypatch
  `nanobot.utils.update.get_remote_pyproject_version` para cubrir: update disponible,
  up-to-date, versión remota menor, error de red (None), cache TTL, versión inválida.
- **WebUI (vitest)**: ajustar/agregar test de `VersionCheckRow` si existe cobertura del
  link; verificar que el link apunta a `githubUrl` con texto "GitHub".
- **Smoke**: `tests/webui/test_settings_routes.py` (endpoint version-check no debe romper).

## Boundaries

- **Always**: correr pytest del módulo + build WebUI antes de commitear; mantener cache;
  mantener comportamiento silencioso ante errores de red.
- **Ask first**: cambiar el contrato del payload del endpoint (se hace: `pypiUrl` →
  `githubUrl`), tocar `nanobot/utils/update.py`.
- **Never**: commitear directo a `main` (siempre branch + PR al fork → upstream);
  agregar dependencias nuevas; cambiar el flujo de update (`perform_update`).

## Success Criteria

1. `check_for_update()` consulta `raw.githubusercontent.com/madkoding/nanobot/main/pyproject.toml`
   (o el helper de `utils.update`) y NUNCA `pypi.org`.
2. Con versión remota > local → payload `{currentVersion, latestVersion, githubUrl}`.
3. Con versión remota ≤ local, o error de red, o versión inválida → `None` (up to date).
4. La UI muestra "GitHub" como link (no "PyPI") apuntando a `githubUrl`.
5. `pytest tests/webui/test_version_check.py` verde; `npm run build` verde.
6. PR a `madkoding/nanobot` con el cambio (branch en fork jpyunism).

## Open Questions

- ¿Mostrar también el SHA de `main` en el estado "up to date" (ej. "main@abc1234")?
  Por defecto NO (YAGNI) — solo versión.
