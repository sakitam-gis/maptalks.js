import { isNil, isNumber, isArrayHasData, getValueOrDefault, isString } from '../../../core/util';
import { getAlignPoint } from '../../../core/util/strings';
import { colorNames } from '../../../core/Constants';
import Size from '../../../geo/Size';
import Point from '../../../geo/Point';
import PointExtent from '../../../geo/PointExtent';
import Canvas from '../../../core/Canvas';
import PointSymbolizer from './PointSymbolizer';

const keyword = /(\D+)/;
const hex = /^#([a-f0-9]{6})([a-f0-9]{2})?$/i;
// eslint-disable-next-line no-useless-escape
const rgba = /^rgba?\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*(?:,\s*([+-]?[\d\.]+)\s*)?\)$/;

function getColor(string) {
    let rgb = [];

    if (string.match(hex)) {
        let match = string.match(hex);
        const hexAlpha = match[2];
        match = match[1];

        for (let i = 0; i < 3; i++) {
            // https://jsperf.com/slice-vs-substr-vs-substring-methods-long-string/19
            const i2 = i * 2;
            rgb[i] = parseInt(match.slice(i2, i2 + 2), 16);
        }

        if (hexAlpha) {
            rgb[3] = Math.round((parseInt(hexAlpha, 16) / 255) * 100) / 100;
        }
    } else if (string.match(rgba)) {
        const match = string.match(rgba);
        for (let i = 0; i < 3; i++) {
            rgb[i] = parseInt(match[i + 1], 0);
        }

        if (match[4]) {
            rgb[3] = parseFloat(match[4]);
        }
    } else if (string.match(keyword)) {
        const match = string.match(keyword);
        if (match[1] === 'transparent') {
            return [0, 0, 0, 0];
        }
        rgb = colorNames[match[1]];
        if (!rgb) {
            return null;
        }
        rgb[3] = 1;
        return rgb;
    } else {
        return null;
    }

    return rgb;
}

export default class ImageMarkerSymbolizer extends PointSymbolizer {

    static test(symbol) {
        if (!symbol) {
            return false;
        }
        if (!isNil(symbol['markerFile'])) {
            return true;
        }
        return false;
    }

    constructor(symbol, geometry, painter) {
        super(symbol, geometry, painter);
        this.style = this._defineStyle(this.translate());

        /**
         * temp canvas
         * @type {null}
         * @private
         */
        this._tempCanvas = null;

        /**
         * 创建临时绘制对象，避免重复调用
         * @type {null}
         * @private
         */
        this._tempCtx = null;
    }

    symbolize(ctx, resources) {
        const style = this.style;
        if (!this.painter.isHitTesting() && (style['markerWidth'] === 0 || style['markerHeight'] === 0 || style['markerOpacity'] === 0)) {
            return;
        }
        const cookedPoints = this._getRenderContainerPoints();
        if (!isArrayHasData(cookedPoints)) {
            return;
        }

        let img = this._getImage(resources);
        if (!img) {
            if (typeof console !== 'undefined') {
                console.warn('no img found for ' + (this.style['markerFile'] || this._url[0]));
            }
            return;
        }

        if ('markerReplaceColor' in this.style) {
            const w = img.width;
            const h = img.height;
            if (!this._tempCtx) {
                this._tempCanvas = Canvas.createCanvas(w, h);
                this._tempCtx = this._tempCanvas.getContext('2d');
            } else {
                Canvas.clearRect(this._tempCtx, this._tempCtx.canvas.width, this._tempCtx.canvas.height);
                this._tempCanvas.width = w;
                this._tempCanvas.height = h;
            }

            Canvas.image(this._tempCtx, img,
                0,
                0,
                w, h);
            this.replaceColor_(this._tempCtx, 0, 0, w, h);
            this._tempCtx.restore();
            img = this._tempCanvas;
        }

        this._prepareContext(ctx);
        let width = style['markerWidth'];
        let height = style['markerHeight'];
        if (!isNumber(width) || !isNumber(height)) {
            width = img.width;
            height = img.height;
            style['markerWidth'] = width;
            style['markerHeight'] = height;
            const imgURL = [style['markerFile'], style['markerWidth'], style['markerHeight']];
            if (!resources.isResourceLoaded(imgURL)) {
                resources.addResource(imgURL, img);
            }
            const painter = this.getPainter();
            if (!painter.isSpriting()) {
                painter.removeCache();
            }
        }
        let alpha;
        // for VectorPathMarkerSymbolizer, opacity is already set into SVG element.
        if (this.symbol['markerType'] !== 'path' &&
            isNumber(style['markerOpacity']) && style['markerOpacity'] < 1) {
            alpha = ctx.globalAlpha;
            ctx.globalAlpha *= style['markerOpacity'];
        }
        const alignPoint = getAlignPoint(new Size(width, height), style['markerHorizontalAlignment'], style['markerVerticalAlignment']);
        for (let i = 0, len = cookedPoints.length; i < len; i++) {
            let p = cookedPoints[i];
            const origin = this._rotate(ctx, p, this._getRotationAt(i));
            if (origin) {
                p = origin;
            }
            Canvas.image(ctx, img,
                p.x + alignPoint.x,
                p.y + alignPoint.y,
                width, height);

            if (origin) {
                ctx.restore();
            }
        }
        if (alpha !== undefined) {
            ctx.globalAlpha = alpha;
        }
    }

    _getImage(resources) {
        const img = !resources ? null : resources.getImage([this.style['markerFile'], this.style['markerWidth'], this.style['markerHeight']]);
        return img;
    }

    getPlacement() {
        return this.symbol['markerPlacement'];
    }

    getRotation() {
        const r = this.style['markerRotation'];
        if (!isNumber(r)) {
            return null;
        }
        //to radian
        return -r * Math.PI / 180;
    }

    getDxDy() {
        const s = this.style;
        const dx = s['markerDx'],
            dy = s['markerDy'];
        return new Point(dx, dy);
    }

    getFixedExtent(resources) {
        const style = this.style;
        const url = style['markerFile'],
            img = resources ? resources.getImage(url) : null;
        const width = style['markerWidth'] || (img ? img.width : 0),
            height = style['markerHeight'] || (img ? img.height : 0);
        const dxdy = this.getDxDy();
        const alignPoint = getAlignPoint(new Size(width, height), style['markerHorizontalAlignment'], style['markerVerticalAlignment']);
        let result = new PointExtent(dxdy.add(0, 0), dxdy.add(width, height));
        result._add(alignPoint);
        const rotation = this.getRotation();
        if (rotation) {
            result = this._rotateExtent(result, rotation);
        }
        return result;
    }

    translate() {
        const s = this.symbol;
        return {
            'markerReplaceColor': s['markerReplaceColor'],
            'markerFile': s['markerFile'],
            'markerOpacity': getValueOrDefault(s['markerOpacity'], 1),
            'markerWidth': getValueOrDefault(s['markerWidth'], null),
            'markerHeight': getValueOrDefault(s['markerHeight'], null),
            'markerRotation' : getValueOrDefault(s['markerRotation'], 0),

            'markerDx': getValueOrDefault(s['markerDx'], 0),
            'markerDy': getValueOrDefault(s['markerDy'], 0),

            'markerHorizontalAlignment': getValueOrDefault(s['markerHorizontalAlignment'], 'middle'), //left | middle | right
            'markerVerticalAlignment': getValueOrDefault(s['markerVerticalAlignment'], 'top'), // top | middle | bottom
        };
    }

    replaceColor_(ctx) {
        if (!this.style.markerReplaceColor) {
            return;
        }
        let color = null;
        if (Array.isArray(color) && color.length > 2) {
            color = this.style.markerReplaceColor;
        } else if (isString(this.style.markerReplaceColor)) {
            color = getColor(this.style.markerReplaceColor);
        }

        if (!color) {
            return;
        }

        const imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const data = imgData.data;
        const r = color[0] / 255.0;
        const g = color[1] / 255.0;
        const b = color[2] / 255.0;

        for (let i = 0, ii = data.length; i < ii; i += 4) {
            data[i] *= r;
            data[i + 1] *= g;
            data[i + 2] *= b;
        }
        ctx.putImageData(imgData, 0, 0);

        if (color[3] !== undefined) {
            ctx.globalAlpha = color[3];
        }
    }
}
