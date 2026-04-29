import { z } from 'zod';

// ---------------------------------------------------------------------------
// ElementInfo
// ---------------------------------------------------------------------------

export const ElementInfoSchema = z.object({
  dataTestId: z.string().nullable(),
  dataTest: z.string().nullable(),
  role: z.string().nullable(),
  accessibleName: z.string().nullable(),
  textContent: z.string().nullable(),
  placeholder: z.string().nullable(),
  id: z.string().nullable(),
  tagName: z.string(),
  labelText: z.string().nullable(),
  name: z.string().nullable(),
  inputType: z.string().nullable(),
  classes: z.array(z.string()),
  parentPath: z.array(z.string()),
  nearbyText: z.array(z.string()),
  boundingBox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable(),
  isVisible: z.boolean(),
});

export type ElementInfo = z.infer<typeof ElementInfoSchema>;

// ---------------------------------------------------------------------------
// Signal (discriminated union)
// ---------------------------------------------------------------------------

export const SignalSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('navigation'), url: z.string() }),
  z.object({ name: z.literal('popup'), popupAlias: z.string() }),
  z.object({ name: z.literal('download'), downloadAlias: z.string() }),
  z.object({ name: z.literal('dialog'), dialogAlias: z.string() }),
]);

export type Signal = z.infer<typeof SignalSchema>;

// ---------------------------------------------------------------------------
// Action schemas
// ---------------------------------------------------------------------------

export const ClickActionSchema = z.object({
  name: z.literal('click'),
  selector: z.string(),
  button: z.enum(['left', 'middle', 'right']).default('left'),
  modifiers: z.number().default(0),
  clickCount: z.number().default(1),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  signals: z.array(SignalSchema).default([]),
});

export const FillActionSchema = z.object({
  name: z.literal('fill'),
  selector: z.string(),
  value: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const HoverActionSchema = z.object({
  name: z.literal('hover'),
  selector: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  signals: z.array(SignalSchema).default([]),
});

export const PressActionSchema = z.object({
  name: z.literal('press'),
  selector: z.string(),
  key: z.string(),
  modifiers: z.number().default(0),
  signals: z.array(SignalSchema).default([]),
});

export const SelectActionSchema = z.object({
  name: z.literal('select'),
  selector: z.string(),
  options: z.array(z.string()),
  signals: z.array(SignalSchema).default([]),
});

export const CheckActionSchema = z.object({
  name: z.literal('check'),
  selector: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const UncheckActionSchema = z.object({
  name: z.literal('uncheck'),
  selector: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const SetInputFilesActionSchema = z.object({
  name: z.literal('setInputFiles'),
  selector: z.string(),
  files: z.array(z.string()),
  signals: z.array(SignalSchema).default([]),
});

export const NavigateActionSchema = z.object({
  name: z.literal('navigate'),
  url: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const AssertVisibleActionSchema = z.object({
  name: z.literal('assertVisible'),
  selector: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const AssertTextActionSchema = z.object({
  name: z.literal('assertText'),
  selector: z.string(),
  text: z.string(),
  substring: z.boolean().default(false),
  signals: z.array(SignalSchema).default([]),
});

export const AssertCheckedActionSchema = z.object({
  name: z.literal('assertChecked'),
  selector: z.string(),
  checked: z.boolean(),
  signals: z.array(SignalSchema).default([]),
});

export const AssertValueActionSchema = z.object({
  name: z.literal('assertValue'),
  selector: z.string(),
  value: z.string(),
  signals: z.array(SignalSchema).default([]),
});

// ---------------------------------------------------------------------------
// Action (discriminated union of all actions)
// ---------------------------------------------------------------------------

export const ActionSchema = z.discriminatedUnion('name', [
  ClickActionSchema,
  FillActionSchema,
  HoverActionSchema,
  PressActionSchema,
  SelectActionSchema,
  CheckActionSchema,
  UncheckActionSchema,
  SetInputFilesActionSchema,
  NavigateActionSchema,
  AssertVisibleActionSchema,
  AssertTextActionSchema,
  AssertCheckedActionSchema,
  AssertValueActionSchema,
]);

export type Action = z.infer<typeof ActionSchema>;

// ---------------------------------------------------------------------------
// PageContext
// ---------------------------------------------------------------------------

export const PageContextSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
});

export type PageContext = z.infer<typeof PageContextSchema>;

// ---------------------------------------------------------------------------
// RecordingAction (each action variant extended with recording metadata)
// ---------------------------------------------------------------------------

const recordingExtraFields = {
  elementInfo: ElementInfoSchema,
  pageContext: PageContextSchema,
  timestamp: z.number(),
  harRef: z.string().optional(),
  screenshot: z.boolean().optional(),
};

export const RecordingActionSchema = z.discriminatedUnion('name', [
  ClickActionSchema.extend(recordingExtraFields),
  FillActionSchema.extend(recordingExtraFields),
  HoverActionSchema.extend(recordingExtraFields),
  PressActionSchema.extend(recordingExtraFields),
  SelectActionSchema.extend(recordingExtraFields),
  CheckActionSchema.extend(recordingExtraFields),
  UncheckActionSchema.extend(recordingExtraFields),
  SetInputFilesActionSchema.extend(recordingExtraFields),
  NavigateActionSchema.extend(recordingExtraFields),
  AssertVisibleActionSchema.extend(recordingExtraFields),
  AssertTextActionSchema.extend(recordingExtraFields),
  AssertCheckedActionSchema.extend(recordingExtraFields),
  AssertValueActionSchema.extend(recordingExtraFields),
]);

export type RecordingAction = z.infer<typeof RecordingActionSchema>;

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export const RecordingSchema = z.object({
  recordingId: z.string().uuid(),
  targetUrl: z.string().url(),
  title: z.string(),
  actions: z.array(RecordingActionSchema),
});

export type Recording = z.infer<typeof RecordingSchema>;
