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
    
    pf = this.getPointForecast(geoJSON.properties.latitude, geoJSON.properties.longitude);

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
    geoJSON.properties.options = {'icon':"https://maps.gstatic.com/mapfiles/ms2/micons/green.png"};
    geoJSON.properties.weather = "Fetching Forecast..." 

    // update, probably asynchronously
    this.updateGeoJSONForecastNowOrLater(geoJSON, departureTime);

    return geoJSON;   
  }
 
  // gather all the forecast data for the right time for this point, 
  // assemble into geoJSON.properties
  pointForecast.prototype.updateGeoJSONForecastNow = function(geoJSON, departureTime) {

    // new departure time
    geoJSON.properties.departureTime = departureTime;

    // corresponding updated arrival time
    var arrivalTime = new Date();
    arrivalTime.setTime(departureTime.getTime() + geoJSON.properties.travelSecs * 1000);

    geoJSON.properties.arrivalTime = arrivalTime;
    
  
    var dtime_string = geoJSON.properties.arrivalTime.toISOString();

    // this is the only way to signal a change to this angular/map/marker, apparently.
    //geoJSON.id = -geoJSON.id;
    geoJSON.properties.weather = "No forecast available."
    geoJSON.properties.options = {'icon':"https://maps.gstatic.com/mapfiles/ms2/micons/white.png"};
    
    if( this.forecastGeoJSON !== undefined && this.forecastGeoJSON.properties !== undefined && this.forecastGeoJSON.properties.forecastSeries !== undefined){
      

      // create time display in time zone of current step
      var arrivalTimeForDisplay = arrivalTime;

      // can't really set the timezone for Date, so we have to fake out UTC ....
      if( this.forecastGeoJSON.properties.timeZoneOffset !== undefined ) {
        var tzSecs = parseInt(this.forecastGeoJSON.properties.timeZoneOffset);
          
        arrivalTimeForDisplay = new Date();
        arrivalTimeForDisplay.setTime(arrivalTime.getTime() + tzSecs *1000);                
      }

      try {
        geoJSON.properties.arrivalDisplay = arrivalTimeForDisplay.format("ddd, h:MM tt", true);

        if ( this.forecastGeoJSON.properties.timeZoneAbbr !== undefined ) {
          geoJSON.properties.arrivalDisplay += " " + this.forecastGeoJSON.properties.timeZoneAbbr;

        }
      }
      catch (e) { 
        $log.debug("can't parse this?? " +arrivalTime.toLocaleString());
        geoJSON.properties.arrivalDisplay = arrivalTime.toLocaleString();
      }
      
      // add area description if we have it
      if ( this.forecastGeoJSON.properties.areaDescription !== undefined ) {
        geoJSON.properties.areaDescription = this.forecastGeoJSON.properties.areaDescription;
      }
      
      // add area description if we have it
      if ( this.forecastGeoJSON.properties.moreWeatherInfo !== undefined ) {
        geoJSON.properties.moreWeatherInfo = this.forecastGeoJSON.properties.moreWeatherInfo;
      }
      else {
        geoJSON.properties.moreWeatherInfo = 'http://www.weather.gov/';
      }
      
      for( var timekey in this.forecastGeoJSON.properties.forecastSeries) {
        if( dtime_string >= timekey  && dtime_string < this.forecastGeoJSON.properties.forecastSeries[timekey]['timeEndUTC']) {
          

          geoJSON.properties.options = {'icon':this.swapIcon(this.forecastGeoJSON.properties.forecastSeries[timekey]['weatherIcon'])};
          geoJSON.properties.weather = this.forecastGeoJSON.properties.forecastSeries[timekey]['weatherSummary'];  

          geoJSON.properties.hazards = this.forecastGeoJSON.properties.forecastSeries[timekey]['hazards']; 
         
        }

      }
    }
    
    return geoJSON;
   
  }

  pointForecast.prototype.swapIcon = function(icon) {

    var translatedIcon = icon;

    try {
      var nws_weatherunderground_map = {
        'fg': 'fog',
        'sctfg': 'fog',
        'nfg': 'nt_fog',
        'nbknfg': 'nt_fog',
        'blizzard': 'snow',
        'du': 'hazy',
        'ndu': 'nt_hazy',
        'hz': 'hazy',
        'fu': 'hazy',
        'nfu': 'nt_hazy',
        'ip': 'sleet',
        'hi_shwrs': 'chancerain',
        'hi_nshwrs': 'nt_changerain',
        'shra': 'rain',
        'shra1': 'rain',
        'shra2': 'rain',
        'nra': 'nt_rain',
        'ra': 'rain',
        'nsn': 'nt_snow',
        'sn': 'snow',
        'rasn': 'snow',
        'nrasn': 'nt_snow',
        'fzra': 'sleet',
        'mix': 'sleet',
        'raip': 'sleet',
        'nraip': 'nt_sleet',    
        'tsra': 'tstorms',
        'scttsra': 'tstorms',
        'ntsra': 'nt_tstorms',
        'nscttsra': 'nt_tstorms',
        'skc': 'mostlysunny',
        'few': 'partlysunny',
        'sct': 'partlycloudy',
        'bkn': 'mostlycloudy',
        'ovc': 'cloudy',
        'nskc': 'nt_clear',
        'nfew': 'nt_partlycloudy',
        'nsct': 'nt_partlycloudy',
        'nbkn': 'nt_mostlycloudy',
        'novc': 'nt_cloudy',
        'hot': 'clear',
        'cold': 'clear',
        'wind': 'clear',
        'nwind': 'nt_clear',
        'tor': 'tstorms',
        'fc': 'tstorms',
        'ntor': 'nt_tstorms',
        'nfc': 'nt_tstorms'
      };

      var iconPieces = icon.split('/');
      var iconName = iconPieces.pop();
      var iconNamePieces = iconName.split('.');
      var iconRoot = iconNamePieces[0];

      var mappedIconRoot = nws_weatherunderground_map[iconRoot];
      if( mappedIconRoot !== undefined ) {
        translatedIcon = "http://icons.wxug.com/i/c/i/" + mappedIconRoot + ".gif";
      }
    }
    catch(e) {
      $log.debug("No icon for " + icon);
    }

    return translatedIcon;
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
                  $log.debug('fetch forecast for '+me.latitude + " " + me.longitude)
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