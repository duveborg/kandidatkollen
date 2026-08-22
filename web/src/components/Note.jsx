/* A caveat set off from the surrounding text. The heading carries its own
   trailing space so it runs into the body sentence. */
export function Note({ heading, children }) {
  return (
    <div className="not">
      <strong>{heading}</strong>
      {children}
    </div>
  );
}
