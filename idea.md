# AI Visual Work Instruction Creator

> Earlier planning notes. [PRD.md](PRD.md) is the current source of truth for MVP requirements, acceptance checks, and later scope. Retain this document as background; its planning statements do not describe completed functionality.

## 1. Challenge and purpose

Caritas-Don Bosco / BBW Würzburg supports young people with autism, mental health conditions, and learning support needs as they prepare for working life.

Trainers currently spend considerable time photographing tasks, transferring images, arranging layouts, and writing understandable explanations. Learners benefit from instructions that clearly communicate the materials, actions, quantities, and expected result.

Our proposed solution is an **AI-assisted PWA that helps trainers turn workplace photographs and notes into editable visual work instructions**.

The hackathon prototype will be built by **three people in six hours**. The demonstration task is **packing a materials kit**.

## 2. Users

**Primary user:** a trainer creating, checking, and updating instructions.

**Beneficiary:** a learner using the resulting visual material.

The prototype provides trainer authoring and a learner preview. We aim to reduce authoring effort and improve instruction clarity. Actual improvements in learner comprehension and independence require evaluation with learners and staff.

The organization already uses visual work sequences, checklists, and individualized support. The product should help trainers extend those practices efficiently. [Organization’s account](https://www.donbosco.de/aktuelles/meldung/caritas-don-bosco-bildungszentrum-ist-weiterhin-autismusgerecht/)

## 3. Agreed MVP workflow

1. Create or resume an instruction draft.
2. Describe the task goal, materials, and exact quantities.
3. Take or select photographs and arrange them in order.
4. Generate short, concrete action steps.
5. Edit text, replace photos, and add, split, or reorder steps.
6. Request quality suggestions.
7. Preview the complete learner instruction.
8. Review and approve the instruction.
9. Download the approved instruction as a PDF.

## 4. Agreed features

| Feature | Prototype behavior |
|---|---|
| Photo capture | Take photographs on Android or choose existing images. |
| Photo organization | Preview, remove, replace, and reorder photographs. |
| Task context | Capture the goal, materials, quantities, finished result, and next action. |
| AI drafting | Generate structured instructions from the supplied facts and photos. |
| Direct editing | Trainers control wording, pictures, and step boundaries/order. |
| Quality suggestions | Flag specific problems and unresolved questions for trainer review. |
| Learner preview | Show the complete sequence of numbered photo cards. |
| Trainer approval | Approve the reviewed version; subsequent edits require review again. |
| PDF export | Produce a real downloadable PDF using a fixed, readable template. |
| Internationalization | English/German interface and English/German instruction generation. |
| Offline authoring | Capture, edit, and recover the current draft after initial online setup. |
| Draft recovery | Preserve one current draft on the device, plus a clearly labeled example. |

Cloud AI generation requires an internet connection.

### Language behavior

Keep **interface language** separate from **instruction language**.

- Interface language changes buttons, labels, errors, and status messages.
- Instruction language controls generated text, preview content, and PDF headings.
- Changing interface language preserves the instruction.
- Choose instruction language when creating a draft.
- Translation of existing instructions is later scope.

## 5. Principles for the learner material

Each instruction should answer:

- What do I need?
- What do I do?
- How much work is required?
- How do I recognize that it is finished?
- What happens next?
- What should I do if something is missing or unclear?

These questions reflect work-system principles described by UNC TEACCH. The trainer also selects appropriate supports and organizes the physical workplace. [UNC TEACCH framework](https://teacch.com/trainings/certification/)

For the materials-kit example:

- Use actual materials and trainer-supplied quantities.
- Use real photographs of the task.
- Write short, literal actions.
- Keep item names consistent.
- Show a recognizable finished kit.
- Include the next action or help instruction.
- Use professional, age-appropriate language and visuals.

Adaptation happens through direct editing and the trainer’s knowledge of the learner. W3C recommends clear steps, predictable layouts, error recovery, and preventing data loss, while recognizing individual differences. [W3C cognitive usability guidance](https://www.w3.org/TR/coga-usable/)

## 6. UI direction

Use a short guided workflow with a focused editor.

| Work area | Contents |
|---|---|
| **Start** | Create instruction, resume draft, load example, interface-language selector. |
| **Describe & photos** | Task details, materials/quantities, instruction language, ordered photographs, and notes. |
| **Edit steps** | Photo beside editable action text, add/remove/move controls, quality suggestions, and save status. |
| **Review & export** | Complete learner preview, finished-result cue, next action, approval, and PDF download. |

### Responsive layout

On Android, use one column and open Preview separately.

On a wider screen, show the editor and preview side by side.

Preview and PDF preserve the same text, photo associations, and sequence. The PDF paginates for paper.

### Visual style and accessibility

Use a professional layout with readable dark text, generous spacing, a restrained accent, and prominent task photographs.

Provide:

- Clearly labeled buttons and fields.
- Large touch targets.
- Visible keyboard focus.
- Text alongside status colors.
- Move up/Move down controls alongside any dragging.
- Predictable Back/Continue navigation.
- Clear local-save and offline states.

Use WCAG 2.2 AA as the implementation baseline, with evaluation before claiming conformance. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## 7. AI behavior

The trainer supplies the factual task context. The AI organizes and simplifies it.

The model should return:

- Structured steps.
- References to the supplied photographs.
- A completion cue and next action where supported by the input.
- Questions about missing or ambiguous information.

Quality feedback should identify the affected step and explain the issue. It should flag missing quantities, unclear wording, incomplete sequences, or missing completion information.

Preserve manual edits and the last successful draft when a request fails.

Trainer approval remains necessary. Structured output and a second AI check cannot establish physical correctness or occupational safety. [NIST generative AI guidance](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)

## 8. Recommended technology stack

| Layer | Recommendation | Reason |
|---|---|---|
| Application | **Next.js App Router + React + TypeScript** | Matches team skills and keeps the UI and backend in one project. |
| Styling | **Tailwind CSS** | Quick responsive styling for a small interface. |
| Installability and offline shell | **Web app manifest + Serwist** | Cache the editor and required assets for offline reopening. |
| Local draft and photos | **IndexedDB through Dexie** | Store structured data and photograph blobs on the device. |
| Internationalization | **Local EN/DE dictionaries + native Intl** | Small scope and available offline. |
| AI interface | **LangChain.js `initChatModel`** | Configure the provider/model centrally. |
| Output validation | **Zod + `withStructuredOutput`** | Validate instruction and quality-feedback structures. |
| Backend | **Next.js Route Handlers using Node.js** | Keep credentials and AI calls on the server. |
| PDF generation | **`@react-pdf/renderer`** | Generate a real PDF from the approved draft. |
| Deployment | **Vercel** | Fits the Next.js application and hosted Android demo. |

### LangChain and model switching

Current LangChain JavaScript documentation uses **`initChatModel`**, imported from **`langchain`**. It can be called directly with **`withStructuredOutput`** and **`invoke`**. [LangChain model documentation](https://docs.langchain.com/oss/javascript/langchain/models)

Use one server configuration value, such as `AI_MODEL`, containing an explicit provider/model identifier.

Install the relevant integration for the configured model. Current integrations include `@langchain/openai` and `@langchain/google`. [OpenAI integration](https://docs.langchain.com/oss/javascript/integrations/chat/openai), [Google integration](https://docs.langchain.com/oss/javascript/integrations/chat/google)

Switching models still requires checking image support, structured output, account access, terms, latency, and actual instruction quality. The initial model ID remains an implementation decision.

### Offline architecture

Keep the editor in one statically prerenderable route, with language preference and draft state managed on the client.

Use separate online API routes for AI generation and quality checking.

Cache the actual editor document and its required assets. Store task data and photos in IndexedDB.

Serwist’s documented configurator mode runs after Next.js prerendering and can precache generated routes. Verify the selected package combination and production output early. [Serwist documentation](https://serwist.pages.dev/docs/next/config)

Display “Saved on this device” only after a successful write, and handle storage failures.

## 9. Vercel deployment and Android demo

The intended demo path is:

1. Deploy the PWA to an HTTPS URL.
2. Open it in Chrome on the Android phone.
3. Complete the initial online setup.
4. Install it through the available browser installation option.
5. Launch it from its icon.
6. Demonstrate capture, generation, editing, approval, and PDF export.
7. Demonstrate offline capture/editing and draft recovery.

Installation behavior depends on the Android device and browser. Verify it on the actual phone. [PWA installation guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

Vercel Functions currently have a **4.5 MB request/response payload limit**. Resize and compress photographs on the device, limit the complete request size, and confirm important details remain legible. [Vercel limits](https://vercel.com/docs/functions/limitations)

Keep provider keys in server environment variables. Drafts remain local in this prototype; the agreed single-device workflow does not require a shared database.

## 10. Demo data and privacy

Use photographs of tools, materials, and completed work without participants, names, or personal records.

Make sending selected photos to the AI deliberate. Avoid logging raw photographs or private task content.

Real deployment requires the organization’s review of providers, retention, access, processing arrangements, and applicable data-protection rules.

## 11. Six-hour delivery plan

| Time | Focus |
|---|---|
| **0:00–0:30** | Agree the data shape, prepare the kit example, deploy an initial build, and establish the offline approach. |
| **0:30–3:00** | Parallel work on UI/languages, capture/offline storage, and AI/PDF functionality. |
| **3:00–4:30** | Integrate the complete workflow using real task photographs. |
| **4:30–5:30** | Check installation, offline recovery, failure handling, and PDF opening on Android. |
| **5:30–6:00** | Fix blocking issues and rehearse the demonstration. |

Suggested ownership:

- **Person 1:** workflow, bilingual UI, learner preview, and approval.
- **Person 2:** photographs, persistence, PWA setup, and deployment.
- **Person 3:** AI endpoints, schemas, quality suggestions, and PDF generation.

All three share integration and phone checks.

## 12. Demo completion criteria

- The deployed PWA installs and reopens on the Android device.
- A trainer can capture/select photos and supply exact task facts.
- AI returns an editable structured draft in the chosen language.
- Text, photos, and step order survive navigation and editing.
- Quality suggestions are specific and trainer controlled.
- Preview shows the complete task, finished result, and next action.
- An approved PDF downloads and opens on the phone.
- Switching interface language preserves document content.
- Offline capture/edit/close/reopen preserves the current draft and photos.
- A failed AI request leaves the draft available for retry or manual editing.

## 13. Later scope

Curriculum mapping with sources, existing-document import, H5P/SCORM export, shared libraries and accounts, cross-device synchronization, learner analytics, translation of existing instructions, and optional speech/video or familiar symbol systems.

For the hackathon, the exported PDF can be uploaded to Moodle as a File resource. [Moodle File resource](https://docs.moodle.org/en/File_resource)

## 14. Current status

The project foundation has been implemented and pushed to GitHub. It includes Next.js, Tailwind, the PWA manifest and shell caching, a serverless health endpoint, dependencies, and basic checks.

The product workflow, local draft/photo persistence, bilingual content, AI requests, approval, PDF export, deployment, Android checks, and learner usability evaluation remain unimplemented or unverified. See [PRD.md](PRD.md) for the current requirements and remaining inputs.
