/** A pill you can press to pick one option out of a row. */
export function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="fw-choice">
      {children}
    </button>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="fw-choices">{children}</div>
    </fieldset>
  )
}
