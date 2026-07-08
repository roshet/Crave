// Placeholder row shown while Browse results load.
export default function SkeletonRow() {
  return (
    <div className="itemRow skeletonRow">
      <div className="skeletonThumb" />
      <div className="skeletonInfo">
        <div className="skeletonText" style={{ width: "55%" }} />
        <div className="skeletonText" style={{ width: "40%" }} />
      </div>
    </div>
  );
}
