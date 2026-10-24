/** はんぶんこハート：真ん中の点線をはさんで、青い左半分とオレンジの右半分が少しすき間をあけて並ぶハート */
export default () => (
  <>
    <path d="M32 5v54" className="g-line" strokeWidth="2" strokeDasharray="2 3.6" />
    <path d="M30.6 19.6C27.2 12 19.4 9.4 13.4 12.9 6.9 16.7 6.1 25.6 10.9 32.5 15.4 39 22.8 45.6 30.6 53Z" className="g-p0" />
    <path d="M33.4 19.6C36.8 12 44.6 9.4 50.6 12.9 57.1 16.7 57.9 25.6 53.1 32.5 48.6 39 41.2 45.6 33.4 53Z" className="g-p1" />
    {/* 左上のつや */}
    <ellipse cx="17.5" cy="19.5" rx="2.6" ry="4.2" transform="rotate(40 17.5 19.5)" className="g-rim" />
  </>
);
