export default function Loading() {
  return <div className="shell route-loading" role="status" aria-label="Loading page"><div className="loading-line short" /><div className="loading-line title" /><div className="loading-line copy" /><div className="loading-cards">{[0,1,2,3].map((item) => <div className="loading-card" key={item}><span /><i /><i /></div>)}</div><span className="sr-only">Loading…</span></div>;
}
