import { toAbsoluteUrl } from '@/lib/helpers';

/**
 * How the app's splash screen will draw the name: the same two rules as
 * mobile/src/components/BrandWordmark.js. The Splix wordmark is Poppins
 * ExtraBold lettering with the x replaced by the logo's mark, two chevron
 * halves facing each other across a thin seam, standing at the height of the
 * lowercase letters. Any other name is set in the same lettering, with every
 * x or X drawn as that same mark. "Splix" itself is the original SVG.
 *
 * Poppins 800 is loaded by index.html for this preview alone.
 */
const X_WIDTH = 34.58;
const X_HEIGHT = 28.46;
const X_LEFT =
  'M15.3559 7.40004C15.7544 8.08309 16.1531 9.11177 16.4378 9.85175V11.4937V16.6932V18.6703C16.1532 19.581 15.8113 20.4347 15.3559 21.2316L11.3147 28.4606H0V28.2393L6.07824 17.6457C6.93197 16.1659 7.33001 15.1982 7.33002 14.2875C7.33002 13.4337 6.98872 12.5798 6.24874 11.3275L0 0.322833V0H11.3718L15.3559 7.40004Z';
const X_RIGHT =
  'M1.0818 7.40004C0.683352 8.08309 0.284595 9.11177 -1.14441e-05 9.85175V11.4937V16.6932V18.6703C0.284584 19.581 0.626459 20.4347 1.0818 21.2316L5.12309 28.4606H16.4377V28.2393L10.3595 17.6457C9.50578 16.1659 9.10774 15.1982 9.10773 14.2875C9.10773 13.4337 9.44903 12.5798 10.189 11.3275L16.4377 0.322833V0H5.0659L1.0818 7.40004Z';

// Poppins' proportions per unit of font size (see BrandWordmark.js).
const X_HEIGHT_EM = 0.56;
const ASCENDER_EM = 0.74;
const DESCENDER_EM = 0.35;
const LINE_EM = 1.4;
const X_GAP_EM = X_HEIGHT_EM * 0.25;
const FRAME_PER_ASCENDER = 57 / 41.55;

const ChevronX = ({ fontSize, color }) => {
  const height = fontSize * X_HEIGHT_EM;
  const width = height * (X_WIDTH / X_HEIGHT);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        height: fontSize * LINE_EM,
        paddingBottom: fontSize * DESCENDER_EM,
        margin: `0 ${fontSize * X_GAP_EM}px`,
      }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${X_WIDTH} ${X_HEIGHT}`} aria-hidden="true">
        <path d={X_LEFT} fill={color} />
        <path d={X_RIGHT} fill={color} transform="translate(18.14 0)" />
      </svg>
    </span>
  );
};

export default function WordmarkPreview({ name, height = 44, color = '#FFFFFF' }) {
  const trimmed = (name || '').trim() || 'Splix';
  if (trimmed.toLowerCase() === 'splix') {
    return (
      <img
        src={toAbsoluteUrl('/brand/splix-wordmark.svg')}
        alt="Splix"
        style={{ height, width: (height * 143.1) / 57 }}
      />
    );
  }
  const fontSize = height / (FRAME_PER_ASCENDER * ASCENDER_EM);
  return (
    <span
      aria-label={trimmed}
      style={{ display: 'inline-flex', alignItems: 'flex-end', whiteSpace: 'nowrap', color }}
    >
      {trimmed.split(/([xX])/).filter(Boolean).map((piece, index) =>
        piece === 'x' || piece === 'X' ? (
          <ChevronX key={index} fontSize={fontSize} color={color} />
        ) : (
          <span
            key={index}
            style={{
              fontFamily: "'Poppins', 'Inter', sans-serif",
              fontWeight: 800,
              fontSize,
              lineHeight: `${fontSize * LINE_EM}px`,
            }}
          >
            {piece}
          </span>
        ),
      )}
    </span>
  );
}
