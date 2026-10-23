/** いしつみのアイコン：平らな岩の上に、平たい石が 4 つ少しずつずれて積んである */
export default () => (
  <>
    <path d="M6 54h52" className="g-line" strokeWidth="2.5" />
    <path d="M18.5 54l3-11.2h21l3 11.2z" className="g-rack" />
    <ellipse cx="32" cy="38.9" rx="14.5" ry="3.9" className="g-p0" />
    <ellipse cx="33.5" cy="31.4" rx="13.5" ry="3.9" transform="rotate(-4 33.5 31.4)" className="g-p1" />
    <ellipse cx="31" cy="24.2" rx="11" ry="3.5" transform="rotate(3 31 24.2)" className="g-p0" />
    <ellipse cx="33" cy="17.6" rx="8.5" ry="3.2" transform="rotate(-6 33 17.6)" className="g-p1" />
  </>
);
