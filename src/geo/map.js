/**
* Classes to manage maps
*/

/**
* Map layer, could be tiled or whatever
*/
cdb.geo.MapLayer = cdb.core.Model.extend({

  defaults: {
    visible: true,
    type: 'Tiled'
  },
  /***
  * Compare the layer with the received one
  * @method isEqual
  * @param layer {Layer}
  */
  isEqual: function(layer) {
    var me = this.toJSON();
    var other = layer.toJSON();
    var myType = me.type? me.type : me.options.type;
    var itsType = other.type? other.type : other.options.type;
    var myTemplate = me.urlTemplate? me.urlTemplate : me.options.urlTemplate;
    var itsTemplate = other.urlTemplate? other.urlTemplate : other.options.urlTemplate;
    if(myType && (myType === itsType)) {
      if(myType === 'Tiled') {
        if(myTemplate === itsTemplate) {
          return true; // tiled and same template
        } else {
          return false; // tiled and differente template
        }
      } else { // same type but not tiled
        var myBaseType = me.base_type? me.base_type : me.options.base_type;
        var itsBaseType = other.base_type? other.base_type : other.options.base_type;
        if(myBaseType) {
          if(myBaseType === itsBaseType) {
            return true;
          } else {
            return false;
          }
        } else { // not gmaps
          return true;
        }

      }
    }
    return false; // different type
  }


});

// Good old fashioned tile layer
cdb.geo.TileLayer = cdb.geo.MapLayer.extend({
  getTileLayer: function() {
  }
});

cdb.geo.GMapsBaseLayer = cdb.geo.MapLayer.extend({
  OPTIONS: ['roadmap', 'satellite', 'terrain', 'custom'],
  defaults: {
    type: 'GMapsBase',
    base_type: 'gray_roadmap',
    style: null
  }
});

/**
 * this layer allows to put a plain color or image as layer (instead of tiles)
 */
cdb.geo.PlainLayer = cdb.geo.MapLayer.extend({
  defaults: {
    type: 'Plain',
    base_type: "plain",
    className: "plain",
    color: '#FFFFFF'
  }
});

// CartoDB layer
cdb.geo.CartoDBLayer = cdb.geo.MapLayer.extend({

  defaults: {
    attribution: 'CartoDB',
    type: 'CartoDB',
    active: true,
    query: null,
    opacity: 0.99,
    auto_bound: false,
    interactivity: null,
    debug: false,
    tiler_domain: "cartodb.com",
    tiler_port: "80",
    tiler_protocol: "http",
    sql_domain: "cartodb.com",
    sql_port: "80",
    sql_protocol: "http",
    extra_params: {},
    cdn_url: null
  },

  activate: function() {
    this.set({active: true, opacity: 0.99, visible: true})
  },

  deactivate: function() {
    this.set({active: false, opacity: 0, visible: false})
  },

  /**
   * refresh the layer
   */
  invalidate: function() {
    var e = this.get('extra_params') || e;
    e.cache_buster = new Date().getTime();
    this.set('extra_params', e);
    this.trigger('change');
  },

  toggle: function() {
    if(this.get('active')) {
      this.deactivate();
    } else {
      this.activate();
    }
  }
});

cdb.geo.Layers = Backbone.Collection.extend({

  model: cdb.geo.MapLayer,

  initialize: function() {
    this.bind('add remove', this._asignIndexes, this);
  },

  clone: function() {
    var layers = new cdb.geo.Layers();
    this.each(function(layer) {
      if(layer.clone) {
        var lyr = layer.clone();
        lyr.set('id', null);
        layers.add(lyr);
      } else {
        var attrs = _.clone(layer.attributes);
        delete attrs.id;
        layers.add(attrs);
      }
    });
    return layers;
  },

  /**
   * each time a layer is added or removed
   * the index should be recalculated
   */
  _asignIndexes: function() {
    for(var i = 0; i < this.size(); ++i) {
      this.models[i].set({ order: i }, { silent: true });
    }
  }
});

/**
* map model itself
*/
cdb.geo.Map = cdb.core.Model.extend({

  defaults: {
    center: [0, 0],
    zoom: 3,
    minZoom: 0,
    maxZoom: 20,
    provider: 'leaflet'
  },

  initialize: function() {
    this.layers = new cdb.geo.Layers();
    this.layers.bind('reset', function() {
      if(this.layers.size() >= 1) {
        this._adjustZoomtoLayer(this.layers.models[0]);
      }
    }, this);

    this.geometries = new cdb.geo.Geometries();
  },

  setView: function(latlng, zoom) {
    this.set({
      center: latlng,
      zoom: zoom
    }, {
      silent: true
    });
    this.trigger("set_view");
  },

  setZoom: function(z) {
    this.set({
      zoom: z
    });
  },

  getZoom: function() {
    return this.get('zoom');
  },

  setCenter: function(latlng) {
    this.set({
      center: latlng
    });
  },

  clone: function() {
    var m = new cdb.geo.Map(_.clone(this.attributes));

    // clone lists
    m.set({
      center:           _.clone(this.attributes.center),
      bounding_box_sw:  _.clone(this.attributes.bounding_box_sw),
      bounding_box_ne:  _.clone(this.attributes.bounding_box_ne),
      view_bounds_sw:   _.clone(this.attributes.view_bounds_sw),
      view_bounds_ne:   _.clone(this.attributes.view_bounds_ne),
      attribution:      _.clone(this.attributes.attribution)
    });
    // layers
    m.layers = this.layers.clone();
    return m;

  },

  /**
  * Change multiple options at the same time
  * @params {Object} New options object
  */
  setOptions: function(options) {
    if (typeof options != "object" || options.length) {
      if (this.options.debug) {
        throw (options + ' options has to be an object');
      } else {
        return;
      }
    }

    // Set options
    _.defauls(this.options, options);

  },

  /**
   * return getViewbounds if it is set
   */
  getViewBounds: function() {
    if(this.has('view_bounds_sw') && this.has('view_bounds_ne')) {
      return [
        this.get('view_bounds_sw'),
        this.get('view_bounds_ne')
      ];
    }
    return null;
  },

  getLayerAt: function(i) {
    return this.layers.at(i);
  },

  getLayerByCid: function(cid) {
    return this.layers.getByCid(cid);
  },

  _adjustZoomtoLayer: function(layer) {
    //set zoom
    var z = layer.get('maxZoom');
    if(_.isNumber(z)) {
      this.set({ maxZoom: z });
    }
    z = layer.get('minZoom');
    if(_.isNumber(z)) {
      this.set({ minZoom: z });
    }
  },

  addLayer: function(layer, opts) {
    if(this.layers.size() == 0) {
      this._adjustZoomtoLayer(layer);
    }
    this.layers.add(layer, opts);
    this.trigger('layerAdded');
    if(this.layers.length === 1) {
      this.trigger('firstLayerAdded');
    }
    return layer.cid;
  },

  removeLayer: function(layer) {
    this.layers.remove(layer);
  },

  removeLayerByCid: function(cid) {
    var layer = this.layers.getByCid(cid);

    if (layer) this.removeLayer(layer);
    else cdb.log.error("There's no layer with cid = " + cid + ".");
  },

  removeLayerAt: function(i) {
    var layer = this.layers.at(i);

    if (layer) this.removeLayer(layer);
    else cdb.log.error("There's no layer in that position.");
  },

  clearLayers: function() {
    while (this.layers.length > 0) {
      this.removeLayer(this.layers.at(0));
    }
  },

  // by default the base layer is the layer at index 0
  getBaseLayer: function() {
    return this.layers.at(0);
  },

  /**
   * Checks if the base layer is already in the map as base map
   */
  isBaseLayerAdded: function(layer) {
    var baselayer = this.getBaseLayer()
    return baselayer && layer.isEqual(baselayer);
  },

  /**
  * gets the url of the template of the tile layer
  * @method getLayerTemplate
  */
  getLayerTemplate: function() {
    var baseLayer = this.getBaseLayer();
    if(baseLayer && baseLayer.get('options'))  {
      return baseLayer.get('options').urlTemplate;
    }
  },


  // remove current base layer and set the specified
  // current base layer is removed
  setBaseLayer: function(layer, opts) {
    opts = opts || {};
    var self = this;
    var old = this.layers.at(0);

    // Check if the selected base layer is already selected
    if (this.isBaseLayerAdded(layer)) {
      opts.alreadyAdded && opts.alreadyAdded();
      return false;
    }

    if (old) { // defensive programming FTW!!
      //remove layer from the view
      //change all the attributes and save it again
      //it will saved in the server and recreated in the client
      self.layers.remove(old);
      layer.set('id', old.get('id'));
      layer.set('order', old.get('order'));
      this.layers.add(layer, { at: 0 });
      layer.save(null, {
        success: function() {
          self.trigger('baseLayerAdded');
          self._adjustZoomtoLayer(layer);
          opts.success && opts.success();
        },
        error: opts.error
      })

    } else {
      self.layers.add(layer, { at: 0 });
      self.trigger('baseLayerAdded');
      self._adjustZoomtoLayer(layer);
      opts.success && opts.success();
    }

    // Set new attribution if exists
    this.set({
      attribution: layer.attributes.attribution || ''
    });

    return layer;
  },

  addGeometry: function(geom) {
    this.geometries.add(geom);
  },

  removeGeometry: function(geom) {
    this.geometries.remove(geom);
  },

  setBounds: function(b) {
    this.attributes.view_bounds_sw = [
        b[0][0],
        b[0][1]
    ];
    this.attributes.view_bounds_ne = [
        b[1][0],
        b[1][1]
    ];

    // change both at the same time
    this.trigger('change:view_bounds_ne', this);

  },

  // set center and zoom according to fit bounds
  fitBounds: function(bounds, mapSize) {
    var z = this.getBoundsZoom(bounds, mapSize);
    if(z == null) {
      return;
    }
    var lat = (bounds[0][0] + bounds[1][0])/2;
    var lon = (bounds[0][1] + bounds[1][1])/2;
    this.set({
      center: [lat, lon],
      zoom: z
    })
  },

  // adapted from leaflat src
  getBoundsZoom: function(boundsSWNE, mapSize) {
    var size = [mapSize.x, mapSize.y],
        zoom = this.get('minZoom') || 0,
        maxZoom = this.get('maxZoom') || 24,
        ne = boundsSWNE[1],
        sw = boundsSWNE[0],
        boundsSize = [],
        nePoint,
        swPoint,
        zoomNotFound = true;

    do {
      zoom++;
      nePoint = cdb.geo.Map.latlngToMercator(ne, zoom);
      swPoint = cdb.geo.Map.latlngToMercator(sw, zoom);
      boundsSize[0] = Math.abs(nePoint[0] - swPoint[0]);
      boundsSize[1] = Math.abs(swPoint[1] - nePoint[1]);
      zoomNotFound = boundsSize[0] <= size[0] || boundsSize[1] <= size[1];
    } while (zoomNotFound && zoom <= maxZoom);

    if (zoomNotFound) {
      return null;
    }

    return zoom - 1;

  }

}, {

  latlngToMercator: function(latlng, zoom) {
    var ll = new L.LatLng(latlng[0], latlng[1]);
    var pp = L.CRS.EPSG3857.latLngToPoint(ll, zoom);
    return [pp.x, pp.y];
  }

});


/**
* Base view for all impl
*/
cdb.geo.MapView = cdb.core.View.extend({

  initialize: function() {

    if (this.options.map === undefined) {
      throw new Exception("you should specify a map model");
    }

    this.map = this.options.map;
    this.add_related_model(this.map);
    this.add_related_model(this.map.layers);

    this.autoSaveBounds = false;

    // this var stores views information for each model
    this.layers = {};
    this.geometries = {};

    this.bind('clean', this._removeLayers, this);
  },

  render: function() {
    return this;
  },

  /**
   * add a infowindow to the map
   */
  addInfowindow: function(infoWindowView) {

    this.$el.append(infoWindowView.render().el);
    this.addView(infoWindowView);
  },

  /**
  * search in the subviews and return the infowindows
  */
  getInfoWindows: function() {
    var result = [];
    for (var s in this._subviews) {
      if(this._subviews[s] instanceof cdb.geo.ui.Infowindow) {
        result.push(this._subviews[s]);
      }
    }
    return result;
  },

  showBounds: function(bounds) {
    throw "to be implemented";
  },

  _removeLayers: function() {
    for(var layer in this.layers) {
      this.layers[layer].remove();
    }
    this.layers = {}
  },

  /**
  * set model property but unbind changes first in order to not create an infinite loop
  */
  _setModelProperty: function(prop) {
    this._unbindModel();
    this.map.set(prop);
    if(prop.center !== undefined || prop.zoom !== undefined) {
      var b = this.getBounds();
      this.map.set({
        view_bounds_sw: b[0],
        view_bounds_ne: b[1]
      });
      if(this.autoSaveBounds) {
        this._saveLocation();
      }
    }
    this._bindModel();
  },

  /** bind model properties */
  _bindModel: function() {
    this._unbindModel();
    this.map.bind('change:view_bounds_sw',  this._changeBounds, this);
    this.map.bind('change:view_bounds_ne',  this._changeBounds, this);
    this.map.bind('change:zoom',            this._setZoom, this);
    this.map.bind('change:center',          this._setCenter, this);
    this.map.bind('change:attribution',     this._setAttribution, this);
  },

  /** unbind model properties */
  _unbindModel: function() {
    /*
    this.map.unbind('change:zoom',   this._setZoom, this);
    this.map.unbind('change:center', this._setCenter, this);
    this.map.unbind('change:view_bounds_sw', this._changeBounds, this);
    this.map.unbind('change:view_bounds_ne', this._changeBounds, this);
    */

    this.map.unbind('change:zoom',            null, this);
    this.map.unbind('change:center',          null, this);
    this.map.unbind('change:view_bounds_sw',  null, this);
    this.map.unbind('change:view_bounds_ne',  null, this);
    this.map.unbind('change:attribution',     null, this);
  },

  _changeBounds: function() {
    var bounds = this.map.getViewBounds();
    if(bounds) {
      this.showBounds(bounds);
    }
  },

  showBounds: function(bounds) {
    this.map.fitBounds(bounds, this.getSize())
  },

  _setAttribution: function(m,attr) {
    this.setAttribution(m._previousAttributes.attribution,attr);
  },

  _addLayers: function() {
    var self = this;
    this.map.layers.each(function(lyr) {
      self._addLayer(lyr);
    });
  },

  _removeLayer: function(layer) {
    var layer_view = this.layers[layer.cid];
    if(layer_view) {
      layer_view.remove();
      delete this.layers[layer.cid];
    }
  },

  _removeGeometry: function(geo) {
    var geo_view = this.geometries[geo.cid];
    delete this.layers[layer.cid];
  },

  getLayerByCid: function(cid) {
    var l = this.layers[cid];
    if(!l) {
      cdb.log.error("layer with cid " + cid + " can't be get");
    }
    return l;
  },

  _setZoom: function(model, z) {
    throw "to be implemented";
  },

  _setCenter: function(model, center) {
    throw "to be implemented";
  },

  _addLayer: function(layer, layers, opts) {
    throw "to be implemented";
  },

  _addGeomToMap: function(geom) {
    throw "to be implemented";
  },

  _removeGeomFromMap: function(geo) {
    throw "to be implemented";
  },

  setAutoSaveBounds: function() {
    var self = this;
    this.autoSaveBounds = true;
  },

  _saveLocation: _.debounce(function() {
      this.map.save(null, { silent: true });
  }, 1000),

  _addGeometry: function(geom) {
    var view = this._addGeomToMap(geom);
    this.geometries[geom.cid] = view;
  },

  _removeGeometry: function(geo) {
    var geo_view = this.geometries[geo.cid];
    this._removeGeomFromMap(geo_view);
    delete this.geometries[geo.cid];
  }


}, {

  _getClass: function(provider) {
    var mapViewClass = cdb.geo.LeafletMapView;
    if(provider === 'googlemaps') {
        if(typeof(google) != "undefined" && typeof(google.maps) != "undefined") {
          mapViewClass = cdb.geo.GoogleMapsMapView;
        } else {
          cdb.log.error("you must include google maps library _before_ include cdb");
        }
    }
    return mapViewClass;
  },

  create: function(el, mapModel) {
    var _mapViewClass = cdb.geo.MapView._getClass(mapModel.get('provider'));
    return new _mapViewClass({
      el: el,
      map: mapModel
    });
  }

}
);
