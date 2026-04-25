/**
 * Side-effect imports to register all built-in stamp expanders.
 *
 * Importing this module triggers registration of all stamp pattern expanders
 * with the PatternExpander registry.
 */

import './stamps/ColumnStampExpander.js';
import './stamps/TriplicateStampExpander.js';
import './stamps/QuadrantStampExpander.js';
import './stamps/ColumnStampDifferentiatedExpander.js';
