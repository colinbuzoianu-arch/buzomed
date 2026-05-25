# Buzomed — Session C: Iris, asistentul intern

## Ce s-a construit

Iris este un asistent flotant intern care trăiește în colțul dreapta-jos al tuturor ecranelor autentificate. Răspunde la întrebări despre Buzomed, detectează probleme tehnice și escaladează la Colin prin email. Nu execută niciodată acțiuni în aplicație.

---

## Fișiere noi

### `components/iris/iris-avatar.tsx`
SVG geometric inspirat din iris anatomic: 2 inele concentrice, 8 spițe radiale, pupilă umplută, catchlight alb. Culori din CSS vars (`--primary`) — se adaptează automat la tema cabinetului.

### `components/iris/iris-panel.tsx`
Client component. Conține:
- **Buton flotant** fix `bottom-4 right-4 z-50` cu avatar Iris (alb pe primary). X când deschis.
- **Indicator unread** (portocaliu, `--accent-warning`) pe buton când Iris răspunde cu panoul închis.
- **Drawer animat** `bottom-20 right-4`, max 520px înălțime, w-[min(380px,calc(100vw-2rem))].
- **Greeting** cu prenumele utilizatorului la prima deschidere.
- **4 starter questions** ca pill buttons — dispar după primul mesaj trimis.
- **Loading dots** (3 bounce spans cu delay 0/0.2/0.4s).
- **Escalation flow**: detectare automată din textul Iris → confirmare user → fetch `/api/iris/escalate` → mesaj de confirmare sau eroare cu email direct.
- **Reset** conversație (buton "Resetează" în header, disponibil după primul mesaj).
- **Mobile overlay** — backdrop blur, tap outside închide panoul.

Props: `cabinetName: string`, `locale: 'ro' | 'en'`, `userName: string`

### `app/api/iris/route.ts`
- Auth: `getApiUser()` (consistent cu restul API-urilor, verifică utilizatori inactivi)
- Rate limit: 60 msg/oră per `userId` (in-memory Map)
- Model: `claude-haiku-4-5-20251001` — rapid, ieftin, suficient pentru help contextual
- Max tokens: 400
- Context injectat în system prompt: userName, userRole, currentPage, cabinetName, locale
- Returnează `{ reply: string }`

### `app/api/iris/escalate/route.ts`
- Auth: `getApiUser()`
- Trimite email la `hello@buzomed.com` via `sendEmail` din `@/lib/email`
- Subject: `[Iris Escalation] Prenume Nume — Cabinet`
- Body HTML cu user info + summary conversație (max 2000 chars)
- Returnează `{ ok: true }` sau `{ error }` cu 500

---

## Fișiere modificate

### `app/(authenticated)/layout.tsx`
- Import `IrisPanel` adăugat
- Query tenant extins: `select: { logoUrl: true, name: true }` — consolidat într-un singur `findUnique` (anterior era separat, acum e `tenantData`)
- `cabinetName = tenantData?.name ?? 'Cabinet'`
- `<IrisPanel>` injectat după `</main>`, condiționat de `hasTenant` (nu apare la super_admin)

### `messages/ro.json` + `messages/en.json`
Grup nou `"iris"` cu 10 chei (assistant, open, close, reset, placeholder, sending, send, enterHint, escalated, escalateError). Stringurile sunt hardcodate în componentă (client component), cheile sunt pentru viitoare i18n prin context.

---

## Decizii de implementare

| Decizie | Motivare |
|---|---|
| `getApiUser()` în loc de `getCurrentUser()` | Consistent cu toate celelalte rute API; verifică și utilizatorii inactivi/șterși |
| `result.success` în escalate (nu `result.ok`) | Tipul real `SendEmailResult` are `success: boolean`, nu `ok` |
| Haiku 4.5 în loc de Sonnet | 5× mai rapid, 10× mai ieftin, suficient pentru help contextual la volum mare |
| Strings hardcodate în componentă | Client component fără acces la `getTranslator` server-side; cheile i18n sunt puse pentru viitor |
| Escalation prin detecție text (nu buton explicit) | Flow mai natural — Iris propune escalation în context, userul confirmă cu "da" |

---

## Build status

```
✓ Compiled successfully in 37.6s
✓ TypeScript: no errors
✓ 57 pagini generate (2 noi: /api/iris, /api/iris/escalate)
```

---

## Acceptance checklist

- [ ] /dashboard → buton circular navy jos-dreapta cu avatar Iris
- [ ] Click → drawer cu salut + 4 starter questions
- [ ] Starter question click → răspuns Haiku
- [ ] "Am o eroare la login" → Iris propune escalation → "da" → email la hello@buzomed.com
- [ ] super_admin: IrisPanel nu apare
- [ ] Mobile: overlay + tap outside închide
- [ ] Indicator unread apare când Iris răspunde cu panoul închis

---

## Deferred

- Wire Iris cu context de pagină mai detaliat (ex: ce entitate se editează)
- Rate limit persistent (Redis) când volumul crește
- Suport streaming (SSE) dacă răspunsurile devin mai lungi
- i18n completă via context provider pentru strings din componentă
