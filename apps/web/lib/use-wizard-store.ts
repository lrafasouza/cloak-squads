"use client";

import { useCallback, useReducer } from "react";

export type WizardStep = 0 | 1 | 2;

export interface WizardState {
  step: WizardStep;
  name: string;
  description: string;
  members: string[];
  threshold: number;
  operator: string;
}

type Action =
  | { type: "SET_NAME"; value: string }
  | { type: "SET_DESCRIPTION"; value: string }
  | { type: "ADD_MEMBER" }
  | { type: "REMOVE_MEMBER"; index: number }
  | { type: "UPDATE_MEMBER"; index: number; value: string }
  | { type: "SET_THRESHOLD"; value: number }
  | { type: "SET_OPERATOR"; value: string }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "RESET" };

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "SET_NAME":
      return { ...state, name: action.value };
    case "SET_DESCRIPTION":
      return { ...state, description: action.value };
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
      return { ...state, threshold: action.value };
    case "SET_OPERATOR":
      return { ...state, operator: action.value };
    case "NEXT":
      return { ...state, step: Math.min(2, state.step + 1) as WizardStep };
    case "BACK":
      return { ...state, step: Math.max(0, state.step - 1) as WizardStep };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

const initialState: WizardState = {
  step: 0,
  name: "",
  description: "",
  members: [""],
  threshold: 1,
  operator: "",
};

export function useWizardStore(initialOperator = "") {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    operator: initialOperator,
  });

  const setName = useCallback((v: string) => dispatch({ type: "SET_NAME", value: v }), []);
  const setDescription = useCallback(
    (v: string) => dispatch({ type: "SET_DESCRIPTION", value: v }),
    [],
  );
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
  const setOperator = useCallback(
    (v: string) => dispatch({ type: "SET_OPERATOR", value: v }),
    [],
  );
  const next = useCallback(() => dispatch({ type: "NEXT" }), []);
  const back = useCallback(() => dispatch({ type: "BACK" }), []);
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return {
    state,
    setName,
    setDescription,
    addMember,
    removeMember,
    updateMember,
    setThreshold,
    setOperator,
    next,
    back,
    reset,
  };
}
