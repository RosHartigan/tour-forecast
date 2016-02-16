angular.module('tourForecast.services',['nemLogging'])

// forecastLocationFactory analyzes a path and determines
// an appropriate set of locations for which to fetch
// the forecast

.factory('forecastLocationFactory', function($log, $timeout, $http, forecastService) {
  
   function forecastLocationFactory() {
    return this;
  }
  
  // add weather steps from the path outlined by a given leg:
  // about 1 every 100 km
  forecastLocationFactory.addWeatherStepsFromLeg = function(leg, forecastMarkers, maps) {

    var travelSecs = 0; // in seconds
    var distanceMeters = 0; // in meters
    var departureTime = new Date();
    
    // first add star and end locations
    var gj = forecastService.createGeoJSONInstance(leg.start_location.lat(), leg.start_location.lng(), departureTime, 0, 0);
    forecastMarkers.push(gj);    

    gj = forecastService.createGeoJSONInstance(leg.end_location.lat(), leg.end_location.lng(), departureTime, leg.distance.value, leg.duration.value);
    forecastMarkers.push(gj);    


    // now parse through steps to add additional locations
    // approx every 100 KM
    var lastDistance = 0;
    var STEP_LENGTH = 100*1000;   // forecast step every 100 km
    var SLUSH = 10 *1000;         //  plus or minus 10k km
    var PIOVER180 = Math.PI / 180;
    var RADIUS = 6366.71 * 1000;  // radius of earth in meters
  
    var steps = leg.steps;

    for( var ii =0; ii < steps.length && (leg.distance.value - distanceMeters) > SLUSH ; ii++ ) {
      
      var step = steps[ii];

      // add the step itself if its at APPROX the right distance
      if(  (distanceMeters - lastDistance) > (STEP_LENGTH - SLUSH)  ) {  
        $log.debug("step " +ii + " " + distanceMeters + " " + travelSecs);
        var gjStep = forecastService.createGeoJSONInstance(step.lat_lngs[0].lat(), step.lat_lngs[0].lng(),departureTime, distanceMeters, travelSecs);
        forecastMarkers.push(gjStep);
        lastDistance = distanceMeters;
      }
      
      // dist calculations courtesy of 
      //    http://williams.best.vwh.net/avform.htm#Dist

      // ---------------------------------------------------
      // Distance between points
      //      
      // The great circle distance d between two points with coordinates {lat1,lon1} and {lat2,lon2} is given by:
      //
      //    d=acos(sin(lat1)*sin(lat2)+cos(lat1)*cos(lat2)*cos(lon1-lon2))
      //
      // A mathematically equivalent formula, which is less subject to rounding error for short distances is:
      //
      //    d=2*asin(sqrt((sin((lat1-lat2)/2))^2 + 
      //                 cos(lat1)*cos(lat2)*(sin((lon1-lon2)/2))^2))

      // ---------------------------------------------------

      // if the next step is too far away... add some intermediate locations
      // calculate distance from latlngs describing the path
      var interStepDist = 0;
      var latRad2 = step.lat_lngs[0].lat() * PIOVER180
      var lonRad2 = step.lat_lngs[0].lng() * PIOVER180;
      for( jj = 1; jj < step.lat_lngs.length && (distanceMeters + step.distance.value - lastDistance) >= STEP_LENGTH; jj++ ) {
        var latRad1 = latRad2;
        var lonRad1 = lonRad2;
        latRad2 = step.lat_lngs[jj].lat() * PIOVER180;
        lonRad2 = step.lat_lngs[jj].lng() * PIOVER180;

        
        var sLat = Math.sin( (latRad1-latRad2)/2 );
        var sLon = Math.sin( (lonRad1-lonRad2)/2 );

        var d = 2 * Math.asin(
          Math.sqrt(sLat * sLat + Math.cos(latRad1)*Math.cos(latRad2)* sLon * sLon)
          )
        * RADIUS;

        interStepDist += d;

        if( (distanceMeters + interStepDist - lastDistance) >= STEP_LENGTH ) {
         
          lastDistance = distanceMeters + interStepDist;

          $log.debug( ii + " " + jj + " " + lastDistance / 1000);

          // add this step after determining travel time
          forecastLocationFactory.addWeatherStepLater(step.lat_lngs[0], distanceMeters, travelSecs, step.lat_lngs[jj], lastDistance, departureTime, forecastMarkers, maps);

        }
      }
      
      distanceMeters += step.distance.value;
      travelSecs += step.duration.value;
    }


  };

  // add a weaterh step after getting additional info about it from google
  forecastLocationFactory.addWeatherStepLater=function(origin, travelMeters, travelSecs, destination, destTravelMeters, departureTime, forecastMarkers, maps, tryCount){
    if( tryCount === undefined ) {
      tryCount = 0;
    }
    var request = {
      origin: origin,
      destination: destination,
      travelMode: google.maps.DirectionsTravelMode.DRIVING
    };

    if( ! tryCount ) {
    //https://api.mapbox.com/distances/v1/mapbox/{profile}?access_token=<your access token>
    var mapboxKey = 'pk.eyJ1IjoicmNvIiwiYSI6IndNQWZoeTAifQ.xC9myqUZVnPPsx1of1liyQ';
    var me = this;
    var url = "https://api.mapbox.com/distances/v1/mapbox/driving?access_token=" + mapboxKey;


    $http.post(url, {
                      "coordinates": [ [ origin.lng(), origin.lat() ],  [destination.lng(), destination.lat()]]
                    }
    )
    .then(function(response) {
        $log.debug("Call to mapbox Distance API succeeded");
        $log.debug(response);
        $log.debug(response.data.durations)
       
    }, function(response) {
        $log.debug("Call to mapbox Distance API FAILED");
        $log.debug(response);
    });

    url = 'https://api.mapbox.com/v4/directions/mapbox.driving/'+origin.lng()+','+origin.lat()+';'+destination.lng()+','+destination.lat()+'.json?alternatives=false&access_token=' + mapboxKey;
    $http.get(url)
    .then(function(response) {
        $log.debug("Call to mapbox Directions API succeeded");
        $log.debug(response);
       $log.debug(response.data.destination.properties.name);
       
    }, function(response) {
        $log.debug("Call to mapbox Directions API FAILED");
        $log.debug(response);
    });
}
    // Route the directions and pass the response to a
    // function to create markers for each step.
    var directionsService = new maps.DirectionsService();

    directionsService.route(request, function(response, status) {

      if (status === google.maps.DirectionsStatus.OK) {
        var innerLeg = response.routes[0].legs[0];
        
        var gjInner = forecastService.createGeoJSONInstance(
          innerLeg.end_location.lat(), 
          innerLeg.end_location.lng(), 
          departureTime, 
          travelMeters + innerLeg.distance.value, 
          travelSecs + innerLeg.duration.value);
        gjInner.properties.areaDescription = innerLeg.end_address;
                     
        forecastMarkers.push(gjInner);

        $log.debug(innerLeg.end_address + " " + (travelMeters + innerLeg.distance.value)/1000 + " " + destTravelMeters/1000 +" " +(travelSecs + innerLeg.duration.value) / (60*60)+ " " + innerLeg.end_location.lat() + " " + innerLeg.end_location.lng());
      }
      else {
        // hmmmmm.....
        // TODO: probably shouldn't add a step if this query fails
        $log.debug("intermediate step travelTime: directionsRequest returned status: " + status);

        // try again in 3 seconds, unless we done this already twice before...
        if( status === google.maps.DirectionsStatus.OVER_QUERY_LIMIT && tryCount < 2) {
          $timeout(function() {
              forecastLocationFactory.addWeatherStepLater(origin, travelMeters, travelSecs, destination, destTravelMeters, departureTime, forecastMarkers, maps, tryCount++);
          }, 3000);

        }
      }
    });
  }

   return forecastLocationFactory;
})

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