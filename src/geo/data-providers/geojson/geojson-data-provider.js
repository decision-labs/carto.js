var _ = require('underscore');
var Backbone = require('backbone');
var fakeFeatures = require('./fake-geojson-features');

var GeoJSONDataProvider = function (vectorLayerView, layerIndex) {
  this._vectorLayerView = vectorLayerView;
  this._layerIndex = layerIndex;

  if (this._vectorLayerView.featuresLoaded()) {
    this.trigger('featuresChanged', this._vectorLayerView.getFeatures()[this._layerIndex]);
  } else {
    vectorLayerView.on('featuresChanged', function (features) {
      this.trigger('featuresChanged', features[this._layerIndex]);
    }.bind(this));
  }

  // Simulate the featureChanged event that will be triggered by the d3.Layer
  // TODO: Remove this when this is working
  setTimeout(function () {
    vectorLayerView.trigger('featuresChanged', fakeFeatures);
  }, 3000);

  setTimeout(function () {
    vectorLayerView.trigger('featuresChanged', [fakeFeatures[0].slice(0, 20)]);
  }, 6000);

  setTimeout(function () {
    vectorLayerView.trigger('featuresChanged', fakeFeatures);
  }, 9000);
};

// TODO: We can extract each "generator" to an individual file so that this file doesn't get too BIG
GeoJSONDataProvider.prototype._dataGeneratorsForDataviews = {
  category: function (features, options) {
    var columnName = options.column;
    var numberOfCategories = 5;

    // TODO: There's probably a more efficient way to do this
    var groups = _.groupBy(features, function (feature) { return feature.properties[columnName]; });
    var groupCounts = _.map(Object.keys(groups), function (key) { return [key, groups[key].length]; });
    var sortedGroups = _.sortBy(groupCounts, function (group) { return group[1]; }).reverse();

    // TODO: Calculate harcoded values
    var data = {
      categories: [],
      categoriesCount: 3,
      count: 7446,
      max: 4580,
      min: 106,
      nulls: 0,
      type: 'aggregation'
    };

    _.each(sortedGroups.slice(0, numberOfCategories), function (category) {
      data.categories.push({
        category: category[0],
        value: category[1],
        agg: false
      });
    });

    return data;
  },

  formula: function (features, options) {
    var operation = options.operation;
    var columnName = options.column;
    var data;
    if (operation === 'count') {
      data = {
        'operation': 'count',
        'result': features.length,
        'nulls': 0,
        'type': 'formula'
      };
    } else if (operation === 'avg') {
      var total = 0;
      _.each(features, function (feature) {
        total += parseInt(feature.properties[columnName], 16);
      });
      data = {
        'operation': 'avg',
        'result': +(total / features.length).toFixed(2),
        'nulls': 0,
        'type': 'formula'
      };
    } else {
      throw new Error("Coudn't generate data for formula dataview and '" + operation + "' operation.");
    }
    return data;
  }
};

GeoJSONDataProvider.prototype.generateDataForDataview = function (dataview, features) {
  var generateData = this._dataGeneratorsForDataviews[dataview.get('type')];
  if (!generateData) {
    throw new Error("Couldn't generate data for dataview of type: " + dataview.get('type'));
  }

  var data = generateData(features, dataview.attributes);
  return data;
};

_.extend(GeoJSONDataProvider.prototype, Backbone.Events);

module.exports = GeoJSONDataProvider;
