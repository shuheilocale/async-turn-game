/**
 * バドミントンのアイコン：ななめに立てたラケット（青い枠とガット）と、右上を飛ぶシャトル（オレンジのコルクと白い羽根）
 */
export default () => (
  <>
    <path d="M24 40 13 55" className="g-line" strokeWidth="4" />
    <ellipse cx="31" cy="27" rx="11" ry="15" transform="rotate(35 31 27)" className="g-p0-stroke" strokeWidth="3.4" />
    <path d="M23.4 20.6 37 38M27.2 15.3 41.2 33.7M20.5 27 33.5 43M22 32 38.5 20.2M25.6 38.2 41.8 26.6M19.5 25 34.2 14.6" className="g-line" strokeWidth="1.4" />
    <path d="M47.5 20.5 58 8.5M47.5 20.5 54 4M47.5 20.5 60 14" className="g-line" strokeWidth="2" />
    <path d="M47.5 20.5 54 4 58 8.5 60 14Z" className="g-stone-white" strokeWidth="1.8" />
    <circle cx="46" cy="22" r="4.6" className="g-p1" />
  </>
);
