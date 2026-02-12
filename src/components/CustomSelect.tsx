"use client";

import { useState, useRef, useEffect } from "react";

interface SelectOption {
  value: string;
  label: string;
  dot?: string;
}

interface CustomSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}

export function CustomSelect({ label, value, onChange, options, disabled = false }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(!open);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const currentIndex = options.findIndex((o) => o.value === value);
      const nextIndex =
        e.key === "ArrowDown"
          ? Math.min(currentIndex + 1, options.length - 1)
          : Math.max(currentIndex - 1, 0);
      onChange(options[nextIndex].value);
    }
  }

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen(!open);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm dark:text-white text-left hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {selected?.dot && (
          <span className={`block h-2 w-2 rounded-full flex-shrink-0 ${selected.dot}`} />
        )}
        <span className="flex-1 truncate">{selected?.label}</span>
        <svg className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg animate-fade-in-up" style={{ animationDuration: "0.15s" }}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                option.value === value
                  ? "bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-white font-medium"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
              }`}
            >
              {option.dot && (
                <span className={`block h-2 w-2 rounded-full flex-shrink-0 ${option.dot}`} />
              )}
              <span>{option.label}</span>
              {option.value === value && (
                <svg className="w-3.5 h-3.5 ml-auto text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
