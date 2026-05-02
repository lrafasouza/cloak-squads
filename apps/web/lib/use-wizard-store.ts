"use client";

import { Keypair } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

export type WizardStep = 0 | 1 | 2;

export interface WizardState {
  step: WizardStep;
  name: string;
  description: string;
  avatarDataUrl: string;
  members: string[];
  threshold: number;
  operator: string;
  createKeySecret: number[];
  createdMultisig: string;
  bootstrapIndex: string;
}

type Action =
  | { type: "SET_NAME"; value: string }
  | { type: "SET_DESCRIPTION"; value: string }
  | { type: "SET_AVATAR"; value: string }
  | { type: "ADD_MEMBER" }
  | { type: "REMOVE_MEMBER"; index: number }
  | { type: "UPDATE_MEMBER"; index: number; value: string }
  | { type: "SET_THRESHOLD"; value: number }
  | { type: "SET_OPERATOR"; value: string }
  | { type: "SET_CREATED_MULTISIG"; value: string }
  | { type: "SET_BOOTSTRAP_INDEX"; value: string }
  | { type: "LOAD_DRAFT"; value: WizardState }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "RESET" };

const DRAFT_KEY = "aegis:create-vault:draft";

function createInitialState(initialOperator = ""): WizardState {
  return {
    step: 0,
    name: "",
    description: "",
    avatarDataUrl: "",
    members: [""],
    threshold: 1,
    operator: initialOperator,
    createKeySecret: Array.from(Keypair.generate().secretKey),
    createdMultisig: "",
    bootstrapIndex: "",
  };
}

function normalizeThreshold(threshold: number, memberCount: number) {
  return Math.max(1, Math.min(threshold, Math.max(1, memberCount)));
}

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "SET_NAME":
      return { ...state, name: action.value };
    case "SET_DESCRIPTION":
      return { ...state, description: action.value };
    case "SET_AVATAR":
      return { ...state, avatarDataUrl: action.value };
    case "ADD_MEMBER":
      if (state.members.length >= 10) return state;
      return { ...state, members: [...state.members, ""] };
    case "REMOVE_MEMBER":
      return {
        ...state,
        members: state.members.filter((_, i) => i !== action.index),
        threshold: Math.min(state.threshold, Math.max(1, state.members.length - 1)),
      };
    case "UPDATE_MEMBER":
      return {
        ...state,
        members: state.members.map((m, i) => (i === action.index ? action.value : m)),
      };
    case "SET_THRESHOLD":
      return { ...state, threshold: normalizeThreshold(action.value, state.members.length + 1) };
    case "SET_OPERATOR":
      return { ...state, operator: action.value };
    case "SET_CREATED_MULTISIG":
      return { ...state, createdMultisig: action.value };
    case "SET_BOOTSTRAP_INDEX":
      return { ...state, bootstrapIndex: action.value };
    case "LOAD_DRAFT":
      return {
        ...action.value,
        step: Math.min(2, Math.max(0, action.value.step)) as WizardStep,
        threshold: normalizeThreshold(action.value.threshold, action.value.members.length + 1),
        createKeySecret:
          action.value.createKeySecret.length > 0
            ? action.value.createKeySecret
            : Array.from(Keypair.generate().secretKey),
      };
    case "NEXT":
      return { ...state, step: Math.min(2, state.step + 1) as WizardStep };
    case "BACK":
      return { ...state, step: Math.max(0, state.step - 1) as WizardStep };
    case "RESET":
      if (typeof window !== "undefined") window.sessionStorage.removeItem(DRAFT_KEY);
      return createInitialState();
    default:
      return state;
  }
}

function parseDraft(value: string | null): WizardState | null {
  if (!value) return null;
  try {
    const draft = JSON.parse(value) as Partial<WizardState>;
    if (!Array.isArray(draft.members) || !Array.isArray(draft.createKeySecret)) return null;
    return {
      step:
        typeof draft.step === "number" ? (Math.min(2, Math.max(0, draft.step)) as WizardStep) : 0,
      name: typeof draft.name === "string" ? draft.name : "",
      description: typeof draft.description === "string" ? draft.description : "",
      avatarDataUrl: typeof draft.avatarDataUrl === "string" ? draft.avatarDataUrl : "",
      members: draft.members.filter((m): m is string => typeof m === "string").slice(0, 10),
      threshold: typeof draft.threshold === "number" ? draft.threshold : 1,
      operator: typeof draft.operator === "string" ? draft.operator : "",
      createKeySecret: draft.createKeySecret.filter((n): n is number => typeof n === "number"),
      createdMultisig: typeof draft.createdMultisig === "string" ? draft.createdMultisig : "",
      bootstrapIndex: typeof draft.bootstrapIndex === "string" ? draft.bootstrapIndex : "",
    };
  } catch {
    return null;
  }
}

export function useWizardStore(initialOperator = "") {
  const [state, dispatch] = useReducer(reducer, initialOperator, createInitialState);
  const [draft, setDraft] = useState<WizardState | null>(null);
  const [draftPromptDismissed, setDraftPromptDismissed] = useState(false);

  useEffect(() => {
    const stored = parseDraft(window.sessionStorage.getItem(DRAFT_KEY));
    if (stored && (stored.name || stored.members.some(Boolean) || stored.operator)) {
      setDraft(stored);
    }
  }, []);

  useEffect(() => {
    if (initialOperator && !state.operator) {
      dispatch({ type: "SET_OPERATOR", value: initialOperator });
    }
  }, [initialOperator, state.operator]);

  useEffect(() => {
    if (!state.name && !state.members.some(Boolean) && !state.operator) return;
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  }, [state]);

  const setName = useCallback((v: string) => dispatch({ type: "SET_NAME", value: v }), []);
  const setDescription = useCallback(
    (v: string) => dispatch({ type: "SET_DESCRIPTION", value: v }),
    [],
  );
  const setAvatar = useCallback((v: string) => dispatch({ type: "SET_AVATAR", value: v }), []);
  const addMember = useCallback(() => dispatch({ type: "ADD_MEMBER" }), []);
  const removeMember = useCallback(
    (i: number) => dispatch({ type: "REMOVE_MEMBER", index: i }),
    [],
  );
  const updateMember = useCallback(
    (i: number, v: string) => dispatch({ type: "UPDATE_MEMBER", index: i, value: v }),
    [],
  );
  const setThreshold = useCallback(
    (v: number) => dispatch({ type: "SET_THRESHOLD", value: v }),
    [],
  );
  const setOperator = useCallback((v: string) => dispatch({ type: "SET_OPERATOR", value: v }), []);
  const setCreatedMultisig = useCallback(
    (v: string) => dispatch({ type: "SET_CREATED_MULTISIG", value: v }),
    [],
  );
  const setBootstrapIndex = useCallback(
    (v: string) => dispatch({ type: "SET_BOOTSTRAP_INDEX", value: v }),
    [],
  );
  const resumeDraft = useCallback(() => {
    if (!draft) return;
    dispatch({ type: "LOAD_DRAFT", value: draft });
    setDraft(null);
    setDraftPromptDismissed(true);
  }, [draft]);
  const discardDraft = useCallback(() => {
    window.sessionStorage.removeItem(DRAFT_KEY);
    setDraft(null);
    setDraftPromptDismissed(true);
  }, []);
  const next = useCallback(() => dispatch({ type: "NEXT" }), []);
  const back = useCallback(() => dispatch({ type: "BACK" }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const hasDraftToResume = useMemo(
    () => !!draft && !draftPromptDismissed,
    [draft, draftPromptDismissed],
  );

  return {
    state,
    hasDraftToResume,
    draft,
    setName,
    setDescription,
    setAvatar,
    addMember,
    removeMember,
    updateMember,
    setThreshold,
    setOperator,
    setCreatedMultisig,
    setBootstrapIndex,
    resumeDraft,
    discardDraft,
    next,
    back,
    reset,
  };
}
