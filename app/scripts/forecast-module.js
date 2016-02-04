angular.module('forecast-module',[]).service('forecastService', function($http, $q, pointForecast) {
  var pointForecasts = [];

  this.getPointForecast = function(latitude, longitude) {
    var pointKey = pointForecast.generateKey(latitude, longitude);
    var pf = pointForecasts[pointKey];
    if( pf === undefined ) {
      
      pf = new pointForecast(latitude, longitude);
    
      // start loading?

      pointForecasts[pointKey] = pf;

    }

    return pf;
  
  }
  
  this.createGeoJSONInstance = function(latitude, longitude, departureTime, distance, travelSecs) {
    
    pf = this.getPointForecast(latitude,longitude);

    var geoJSON = pf.createGeoJSONInstance(departureTime, distance, travelSecs);

    return geoJSON;   
  }
   
  // update geoJSON with new departure time
  this.updateGeoJSONInstance = function(geoJSON, departureTime) {
    
    pf = this.getPointForecast(geoJSON.key);

    // update, probably asynchronously
    pf.updateGeoJSONForecastNowOrLater(geoJSON, departureTime);

    return geoJSON;   
  }
})
.factory('pointForecast', function ($http, $q, $log) {
  
  
  // constructor
  function pointForecast(latitude, longitude) {
    this.latitude = latitude;
    this.longitude = longitude;

    this.key = pointForecast.generateKey(latitude,longitude);
    this.isCurrent = false;
    
    return this;
  }

  // reusable id storage: could just generate these
  var pointIds = [];
  pointForecast.getId = function(latitude, longitude) {

      var str = pointForecast.generateKey(latitude,longitude);
      var idx = pointIds.indexOf(str);
      if( idx == -1) {
        pointIds.push(str);
        idx = pointIds.indexOf(str);
      }
      return idx+1;

  };

  pointForecast.generateKey = function(latitude, longitude) {

      return ""+latitude+","+longitude;     
  };

  // create a geoJSON object which contains forecast data for 
  // this location, given the specified departure time
  var curId = 1;
  pointForecast.prototype.createGeoJSONInstance = function(departureTime, distance, travelSecs) {
    
    
    var geoJSON = {"type" : "Feature", "id": curId++, 
        "properties": { "key": pf.key,
                        "travelSecs": travelSecs, "distance": distance, 
                        "latitude":this.latitude,"longitude":this.longitude }};
    
    geoJSON.geometry = { "type": "Point",  "coordinates": [this.latitude, this.longitude]};
    
    // thse are the properties that will change over the lifetime of this marker
    geoJSON.properties.icon = "https://maps.gstatic.com/mapfiles/ms2/micons/green.png";
    geoJSON.properties.weather = "Fetching Forecast..." 

    // update, probably asynchronously
    this.updateGeoJSONForecastNowOrLater(geoJSON, departureTime);

    return geoJSON;   
  }
 
  // gather all the forecast data for the right time for this point, 
  // assemble into geoJSON.properties
  pointForecast.prototype.updateGeoJSONForecastNow = function(geoJSON, departureTime) {

    geoJSON.properties.departureTime = departureTime;

    var arrivalTime = new Date();
    arrivalTime.setTime(departureTime.getTime() + geoJSON.properties.travelSecs * 1000);
    
    geoJSON.properties.arrivalTime = arrivalTime;
    
  
    var dtime_string = geoJSON.properties.arrivalTime.toISOString();

    // this is the only way to signal a change to this angular/map/marker, apparently.
    geoJSON.id = -geoJSON.id;
    geoJSON.weather = "No forecast available."
    geoJSON.properties.icon = "https://maps.gstatic.com/mapfiles/ms2/micons/white.png";
    
    if( this.forecastGeoJSON !== undefined && this.forecastGeoJSON.properties !== undefined && this.forecastGeoJSON.properties.forecastSeries !== undefined){
      for( var timekey in this.forecastGeoJSON.properties.forecastSeries) {
        if( dtime_string >= timekey  && dtime_string < this.forecastGeoJSON.properties.forecastSeries[timekey]['timeEndUTC']) {
          
          geoJSON.properties.icon = this.forecastGeoJSON.properties.forecastSeries[timekey]['weatherIcon'];
          geoJSON.properties.weather = this.forecastGeoJSON.properties.forecastSeries[timekey]['weatherSmmary'];  
        }

      }
    }
    
    return geoJSON;
   
  }
  
  // gather all the forecast data for the right time for this point, if it exists:
  //  else fetch and update later. 
  // assemble into geoJSON.properties
  pointForecast.prototype.updateGeoJSONForecastNowOrLater = function(geoJSON, departureTime) {

    // check for currency by date eventually - now just a flag
    if( this.isCurrent ) {
       this.updateGeoJSONForecastNow(geoJSON, departureTime);
    }
    else {
      var me = this;
      this.get_NWS_Forecast().then(function(response) {
         me.updateGeoJSONForecastNow(geoJSON, departureTime);
      }, function(response) {
        $log.debug('get_NWS_Forecast return error: ');
        $log.debug(response);
         // set is current to true?
         me.updateGeoJSONForecastNow(geoJSON, departureTime);

      });
    }   
  }
  // get the National Weather Service gml forecast
  
  // get the National Weather Service gml forecast
  pointForecast.prototype.get_NWS_Forecast = function() {

    var me = this;
    var url = "/cgi-bin/nws_forecast.pl";
    return $http.get(url, {
            params: { lat: me.latitude, lon : me.longitude }
        })
          .then(function(response) {
              if (typeof response.data === 'object') {
                  me.isCurrent = true;
                  me.forecastGeoJSON = response.data;
              } else {
                  // invalid response; probably no forecast available for that location.
                  me.isCurrent = true;
                  me.forecastGeoJSON = {};
              }

          }, function(response) {
              // something went wrong with the server.
              // time stamo here
              me.isCurrent = true;
              me.forecastGeoJSON = {};
          });
  }



  return pointForecast;

});