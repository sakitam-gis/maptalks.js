import { extend, wrap } from '../../core/util';
import Common from './Projection';
import Coordinate from '../Coordinate';
import { WGS84Sphere } from '../measurer';

/**
 * Well-known projection used by Google maps or Open Street Maps, aka Mercator Projection.<br>
 * It is map's default projection.
 * @class
 * @category geo
 * @protected
 * @memberOf projection
 * @name EPSG3857
 * @mixes projection.Common
 * @mixes measurer.WGS84Sphere
 */
export default extend({}, Common, /** @lends projection.EPSG3857 */ {
    /**
     * "EPSG:3857", Code of the projection
     * @type {String}
     * @constant
     */
    code: 'EPSG:3857',
    rad: Math.PI / 180,
    metersPerDegree: 6378137 * Math.PI / 180,
    maxLatitude: 85.0511287798,

    project: function (lnglat, out) {
        const rad = this.rad,
            metersPerDegree = this.metersPerDegree,
            max = this.maxLatitude;
        const lng = lnglat.x,
            lat = Math.max(Math.min(max, lnglat.y), -max);
        let c;
        if (lat === 0) {
            c = 0;
        } else {
            c = Math.log(Math.tan((90 + lat) * rad / 2)) / rad;
        }
        const x = lng * metersPerDegree;
        const y = c * metersPerDegree;
        if (out) {
            out.x = x;
            out.y = y;
            return out;
        }
        return new Coordinate(x, y);
    },

    unproject: function (pLnglat, out) {
        const x = pLnglat.x,
            y = pLnglat.y;
        const rad = this.rad,
            metersPerDegree = this.metersPerDegree;
        let c;
        if (y === 0) {
            c = 0;
        } else {
            c = y / metersPerDegree;
            c = (2 * Math.atan(Math.exp(c * rad)) - Math.PI / 2) / rad;
        }
        const rx = wrap(x / metersPerDegree, -180, 180);
        const ry = wrap(c, -this.maxLatitude, this.maxLatitude);
        if (out) {
            out.x = rx;
            out.y = ry;
            return out;
        }
        return new Coordinate(rx, ry);
        // return new Coordinate(wrap(x / metersPerDegree, -180, 180), wrap(c, -this.maxLatitude, this.maxLatitude));
        // FIXME: sakitam-fdd - config wrap coordinates
        // return new Coordinate(x / metersPerDegree, c);
    }
}, WGS84Sphere);
