import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Wordmark from '../assets/wordmark.svg';
import { useBranding } from '../branding/BrandingProvider';

/**
 * The app's name as the wordmark draws it.
 *
 * The Splix wordmark (assets/wordmark.svg) is not text in a font: it is the
 * letterforms exported from Figma. The S, p, l and i are Poppins ExtraBold
 * outlines, and the x is not a letter at all but the logo's mark, two chevron
 * halves facing each other across a thin seam, standing on the baseline at
 * the height of the lowercase letters.
 *
 * With the built-in name the SVG is drawn as it always was. With a name set
 * in the admin panel the same two rules give the same look: the letters are
 * set in Poppins ExtraBold, and every x (or X) in the name is drawn as that
 * same chevron pair, at the x-height of the letters around it, from the very
 * paths in the SVG. "Splix" set this way and the SVG are the same picture.
 *
 *   height  the ascender-to-descender height, as the SVG's 57-unit frame:
 *           the splash screen draws it at 56.
 */

// The two halves of the x, verbatim from wordmark.svg (each 16.44 wide and
// 28.46 tall, 1.7 apart), in a box of the pair's own size.
const X_WIDTH = 34.58;
const X_HEIGHT = 28.46;
const X_LEFT =
  'M15.3559 7.40004C15.7544 8.08309 16.1531 9.11177 16.4378 9.85175V11.4937V16.6932V18.6703C16.1532 19.581 15.8113 20.4347 15.3559 21.2316L11.3147 28.4606H0V28.2393L6.07824 17.6457C6.93197 16.1659 7.33001 15.1982 7.33002 14.2875C7.33002 13.4337 6.98872 12.5798 6.24874 11.3275L0 0.322833V0H11.3718L15.3559 7.40004Z';
const X_RIGHT =
  'M1.0818 7.40004C0.683352 8.08309 0.284595 9.11177 -1.14441e-05 9.85175V11.4937V16.6932V18.6703C0.284584 19.581 0.626459 20.4347 1.0818 21.2316L5.12309 28.4606H16.4377V28.2393L10.3595 17.6457C9.50578 16.1659 9.10774 15.1982 9.10773 14.2875C9.10773 13.4337 9.44903 12.5798 10.189 11.3275L16.4377 0.322833V0H5.0659L1.0818 7.40004Z';

// Poppins' proportions, per unit of font size: the lowercase letters stand
// 0.56 high, the ascenders 0.74, the descenders hang 0.35 below the baseline
// and the natural line is 1.4 tall. In the SVG the x-height is 28.46 of a
// 41.55 ascender, the same ratio once the chevrons' flat tops are allowed for.
const X_HEIGHT_EM = 0.56;
const ASCENDER_EM = 0.74;
const DESCENDER_EM = 0.35;
const LINE_EM = ASCENDER_EM + DESCENDER_EM + 0.31; // 1.4, Poppins' own line height
// In the SVG the x sits 7 units from the i and 7 from the frame's edge, a
// quarter of the x-height each side.
const X_GAP_EM = X_HEIGHT_EM * 0.25;
// The SVG's frame, ascender top to descender bottom, in ascender units.
const FRAME_PER_ASCENDER = 57 / 41.55;

const ChevronX = ({ fontSize, color }) => {
  const height = fontSize * X_HEIGHT_EM;
  const width = height * (X_WIDTH / X_HEIGHT);
  return (
    <View
      style={{
        height: fontSize * LINE_EM,
        justifyContent: 'flex-end',
        paddingBottom: fontSize * DESCENDER_EM,
        marginHorizontal: fontSize * X_GAP_EM,
      }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${X_WIDTH} ${X_HEIGHT}`}>
        <Path d={X_LEFT} fill={color} />
        <Path d={X_RIGHT} fill={color} transform="translate(18.14 0)" />
      </Svg>
    </View>
  );
};

// The name split into runs of letters and single x's, in order.
const pieces = (name) => name.split(/([xX])/).filter(Boolean);

const BrandWordmark = ({ height = 56, color = '#FFFFFF', style }) => {
  const { appName, isDefaultName, wordmarkFontReady } = useBranding();

  if (isDefaultName) {
    // The frame is 143.1 by 57; width follows height.
    return <Wordmark width={(height * 143.1) / 57} height={height} style={style} />;
  }

  const fontSize = height / (FRAME_PER_ASCENDER * ASCENDER_EM);
  const text = {
    // Until the font is in, the heaviest system weight stands in for a frame or two.
    fontFamily: wordmarkFontReady ? 'Poppins_800ExtraBold' : undefined,
    fontWeight: wordmarkFontReady ? undefined : '900',
    fontSize,
    lineHeight: fontSize * LINE_EM,
    color,
    includeFontPadding: false,
  };

  return (
    <View style={[styles.row, style]} accessibilityRole="header" accessibilityLabel={appName}>
      {pieces(appName).map((piece, index) =>
        piece === 'x' || piece === 'X' ? (
          // An uppercase X in a name is still the mark: the mark has one size.
          <ChevronX key={index} fontSize={fontSize} color={color} />
        ) : (
          <Text key={index} style={text} numberOfLines={1}>
            {piece}
          </Text>
        )
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});

export default BrandWordmark;
