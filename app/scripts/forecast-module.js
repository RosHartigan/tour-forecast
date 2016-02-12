angular.module('forecast-module',[])


// forecastService creates a library of lat/lon based forecasts
// and provides helper functions which create a time specific
// geoJSON object representing the forecast for a given lat/lon/time
.service('forecastService', function(pointForecast) {
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

  // get a date/time string for local time at lat/long
  this.createPrettyLocalDateTime = function(latitude, longitude, dt) {
     pf = this.getPointForecast(latitude, longitude);

     return pf.createPrettyLocalDateTime(dt);

  }  
})
// pointForecast creates individual points with 5 day forecasts loaded from NWS
// It also updates a geoJSON object from those point forecasts for a particular time
.factory('pointForecast', function ($http, $q, $log, forecastIconService) {
  
  
  // constructor
  function pointForecast(latitude, longitude) {
    this.latitude = latitude;
    this.longitude = longitude;

    this.key = pointForecast.generateKey(latitude,longitude);
    this.isCurrent = false;
    
    return this;
  }

  // get our uniquey key for the library
  pointForecast.generateKey = function(latitude, longitude) {

      return ""+latitude+","+longitude;     
  };

  // create a geoJSON object which contains forecast data for 
  // this location, given specified departure time and time to arrive
  var curId = 1;
  pointForecast.prototype.createGeoJSONInstance = function(departureTime, distance, travelSecs) {
    
    var geoJSON = {
      "type" : "Feature", "id": curId++, 
      "properties": { "key": pf.key,
                      "travelSecs": travelSecs, 
                      "distance": distance, 
                      "latitude":this.latitude,
                      "longitude":this.longitude
                       }};
    
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

    // new departure time
    geoJSON.properties.departureTime = departureTime;

    // corresponding updated arrival time
    if( geoJSON.properties.travelSecs != undefined ) {
      var arrivalTime = new Date(departureTime.getTime() + geoJSON.properties.travelSecs * 1000);
      geoJSON.properties.arrivalTime = arrivalTime;
    
      // create time display in time zone of current step
      geoJSON.properties.arrivalDisplay = this.createPrettyLocalDateTime(arrivalTime);
    }
    else {
      geoJSON.properties.arrivalDisplay = "";
    }

    geoJSON.properties.weather = undefined;
    geoJSON.properties.hazards = undefined;
    geoJSON.properties.icon = "https://maps.gstatic.com/mapfiles/ms2/micons/blue.png";
    
    if( this.forecastGeoJSON !== undefined && this.forecastGeoJSON.properties !== undefined ){
        
      var srcProps = this.forecastGeoJSON.properties;

      // add area description if we have it
      var areaDescription = srcProps.areaDescription;

      // check for weird NWS repeat in the place
      if( areaDescription ) {
        var dp = areaDescription.split(" and ");
        if( dp.length === 2 && dp[0] === dp[1]) {
          areaDescription = dp[0];
        }
      }

      geoJSON.properties.areaDescription = areaDescription;
      
      // add link to more info if we have it
      if ( srcProps.moreWeatherInfo !== undefined ) {
        geoJSON.properties.moreWeatherInfo = srcProps.moreWeatherInfo;
      }
      else {
        geoJSON.properties.moreWeatherInfo = 'http://forecast.weather.gov/MapClick.php?textField1=' + geoJSON.properties.latitude + '&textField2=' + geoJSON.properties.longitude;
      }

      // now move all the credit stuff...
      ['credit', 'disclaimer', 'creditLogo'].forEach(function (aProp) {
        geoJSON.properties[aProp] = srcProps[aProp];
      })

      // get the forecast for this time slot    
      var dtime_string = geoJSON.properties.arrivalTime.toISOString();
      for( var timekey in srcProps.forecastSeries) {
        if( dtime_string >= timekey ) {
          if( dtime_string < srcProps.forecastSeries[timekey]['timeEndUTC']) {
            var forecast = srcProps.forecastSeries[timekey];
            // icon
            geoJSON.properties.icon = forecastIconService.swapIcon(forecast['weatherIcon'], 'nws', 'weather.com', 'i');
            
            // weather summary
            if( forecast['weatherSummary'] !== undefined) {
              geoJSON.properties.weather = forecast['weatherSummary'];  
            }
            // backup - use weather text
            else if( forecast['weatherText'] !== undefined && geoJSON.properties.weather === undefined) {
              geoJSON.properties.weather = forecast['weatherText'];  
            }

            // temp
            geoJSON.properties.temperature = forecast['temperature'];  
            
            // hazards
            // don't overwrite if already set
            if( forecast['hazards'] !== undefined) {
              geoJSON.properties.hazards = srcProps.forecastSeries[timekey]['hazards'];           
            }
          }
          else {
          }          
        }

      }
    }
    // make sure user realized we have no data here
    if(  geoJSON.properties.weather === undefined){
        geoJSON.properties.weather = "No forecast available.";
    }
    return geoJSON;
   
  }

  // create a short displayable day/time string in time LOCAL to this point
  // include timezone desc if different
  pointForecast.prototype.createPrettyLocalDateTime = function(dt) {

    // its possible this date is undknown
    if( dt === undefined ) {
      return "";
    }

    var displayString = "";
    var tzSecs = 0;
    try {
      tzSecs = - dt.getTimezoneOffset() * 60;
      tzSecs = parseInt(this.forecastGeoJSON.properties.timeZoneOffset);  
    }
    catch (e) {

    }

    // create time display in time zone of this point
    try {
      var dayTimeForDisplay = dt;
      displayString = dt.toLocaleString();

      // can't really set the timezone for Date, so we have to fake out UTC ....    
      arrivalTimeForDisplay = new Date(dt.getTime());      
      arrivalTimeForDisplay.addSeconds( tzSecs );
    
      displayString = arrivalTimeForDisplay.format("ddd, h:MM tt", true);

      var tzmins = - tzSecs / 60;
      if( tzmins !== dt.getTimezoneOffset() ) {
          // it's not exactly correct to use THIS timezone to get daylight savings indicator 
          // for another time zone, but it'll do pig
          var tza =  Date.getTimezoneAbbreviation(this.forecastGeoJSON.properties.timeZone, dt.isDaylightSavingTime());      
          displayString += " " + tza;
        }
      }
      catch (e) { 
        $log.debug("Error in createPrettyLocalDateTime " + e);
      }

      return displayString;
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
                  me.forecastGeoJSON = response.data;
                   me.isCurrent = true;
              } else {
                  // invalid response; probably no forecast available for that location.
                  me.isCurrent = true;
                  me.forecastGeoJSON = {};
                  $log.debug("Did not get an object back from nws_forecast");
                  $log.debug(response);
              }

          }, function(response) {
              // something went wrong with the server.
              // time stamo here
              me.isCurrent = true;
              me.forecastGeoJSON = {};
                  $log.debug("Got an error back from nws_forecast");
                  $log.debug(response);
          });
  }

  return pointForecast;

})
.service('forecastIconService', function($log){
    this.swapIcon = function(icon, fromSet, toSet, toSubset) {

    var translatedIcon = icon;

    if( fromSet === undefined ) {
      fromSet = "nws";
    }
    if( toSet === undefined ) {
      toSet = "weather.com";
    }
    if( toSubset === undefined ) {
      toSubset = "i/";
    }
    else {
      toSubset += "/";    
    }

    // no translation
    if( fromSet === toSet ) {
      return icon;
    }


    try {

      var icon_map = {
        "nws_weather.com": {
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
        'nfzra': 'nt_sleet',
        'mix': 'sleet',
        'raip': 'sleet',
        'nraip': 'nt_sleet',    
        'tsra': 'tstorms',
        'scttsra': 'tstorms',
        'ntsra': 'nt_tstorms',
        'nscttsra': 'nt_tstorms',
        'skc': 'sunny',
        'few': 'sunny',
        'sct': 'partlysunny',
        'bkn': 'mostlycloudy',
        'ovc': 'cloudy',
        'nskc': 'nt_clear',
        'nfew': 'nt_partlycloudy',
        'nsct': 'nt_partlycloudy',
        'nbkn': 'nt_mostlycloudy',
        'novc': 'nt_cloudy',
        'hot': 'sunny',
        'cold': 'clear',
        'wind': 'clear',
        'nwind': 'nt_clear',
        'tor': 'tstorms',
        'fc': 'tstorms',
        'ntor': 'nt_tstorms',
        'nfc': 'nt_tstorms',
        'default_rooturl': "http://icons.wxug.com/i/c/",
        'default_ext': ".gif"
        }
      };

      var iconPieces = icon.split('/');
      var iconName = iconPieces.pop();
      var iconNamePieces = iconName.split('.');


      var iconRoot = iconNamePieces[0];

      // wwed out the nws icons with percentages (ie sn90)      
      for( var ii = 10; iconRoot.length > 2 && ii <= 100; ii += 10 ) {
        var s = "" + ii;
        if( iconRoot.length > s. length && iconRoot.indexOf(s) === iconRoot.length-s.length) {
          iconRoot = iconRoot.substring(0,iconRoot.length-s.length);
          break;
        }
      }
      var map = icon_map[fromSet + "_" + toSet];
      var mappedIconRoot = map[iconRoot];
      if( mappedIconRoot !== undefined ) {
        translatedIcon = map['default_rooturl'] + toSubset + mappedIconRoot +  map['default_ext'];
      }
    }
    catch(e) {
      $log.debug("No icon for " + icon);
    }

    return translatedIcon;
  }

});