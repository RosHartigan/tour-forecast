
var mapApp = angular.module('tour-forecast-app', ['uiGmapgoogle-maps', 'forecast-module', 'ui.bootstrap-slider'])

.config(['uiGmapGoogleMapApiProvider', '$httpProvider', function (GoogleMapApi) {
  GoogleMapApi.configure({
//    key: 'your api key',
    // v: '3.20',
    libraries: 'drawing,geometry,visualization,places'
  });
}])

// Enable AngularJS to send its requests with the appropriate CORS headers
  // globally for the whole app:

.run(['$templateCache', function ($templateCache) {
  $templateCache.put('searchboxStart.tpl.html', '<input id="pac-input" class="pac-controls" type="text" placeholder="Starting Location">');
  $templateCache.put('searchboxEnd.tpl.html', '<input id="pac-input" class="pac-controls" type="text" placeholder="Destination">');
  $templateCache.put('window.tpl.html', '<div ng-controller="WindowCtrl" ng-init="showPlaceDetails(parameter)">{{place.name}}</div>');
}])
.controller("tour-forecast-ctrl",['$scope', '$timeout', 'uiGmapLogger','uiGmapGoogleMapApi', 'forecastService',
function ($scope, $timeout, $log,GoogleMapApi, forecastService) {

 $log.currentLevel = $log.LEVELS.debug;

 GoogleMapApi.then(function(maps) {
    $scope.googleVersion = maps.version;
    maps.visualRefresh = true;   

    $scope.maps = maps;

    $scope.directionsDisplay = new $scope.maps.DirectionsRenderer({
        suppressMarkers: true
    });
    $scope.directionsDisplay.addListener('directions_changed', function() {
      $log.debug('directions_changed');
      $scope.createWeatherStepsFromDirections($scope.directionsDisplay.getDirections(), $scope.directionsDisplay.getRouteIndex());
    });
    $scope.directionsDisplay.addListener('routeindex_changed', function() {
      $log.debug('routeindex_changed ' + $scope.directionsDisplay.getRouteIndex());
      if( $scope.routeUpToDate ) {
        $scope.createWeatherStepsFromDirections($scope.directionsDisplay.getDirections(), $scope.directionsDisplay.getRouteIndex());
      }
    });
   
  });
  
  angular.extend($scope, {
   
    map: {
      show: true,
      control: {},
      version: "uknown",
      
      center: {
        latitude: 39.5,
        longitude: -98.35
      },
      options: {
        streetViewControl: false,
        panControl: false,
        maxZoom: 20,
        minZoom: 3
      },
      zoom: 4,
      dragging: false,
      bounds: {},
      
    },
    searchboxStart: {
      template: 'searchboxStart.tpl.html',
      options: {
        visible: true,
        ref: "start"
      }
    },
    searchboxEnd: {
      template: 'searchboxEnd.tpl.html',
      options: {
        visible: true,
        ref: "end"
      }
      
    },
    searchbox: {
      events: {
        places_changed: function (searchBox) {
          places = searchBox.getPlaces()
        
          if (places.length == 0) {
            return;
          }
          
          $scope.routePlaces[searchBox.ref] = places[0];
          $scope.calcRoute($scope.routePlaces);
        }
      }
    },
    forecastMarkers: [],
    
    routePlaces: {
      start:null,
      end:null
    },

    departureTimeIdx: 0,

    departureTimeDisplay: "now",
    departureTimeDisplays: [{'display':"now", 'dateObj':null}],

    routeUpToDate : false
  });

  // SLIDING TIME SELECTION
  // build a list of possible departure times for the slider
  $scope.rebuildDepartureTimes = function () {
      
    $scope.departureTimeIdx = 0;

    $scope.departureTimeDisplays = [{'display':"now", 'dateObj':null}];

    if( $scope.forecastMarkers.length === 0) {
      return;
    }
    var nextTime = new Date();
    nextTime.setMinutes(0);
    nextTime.setSeconds(0);
    nextTime.setMilliseconds(0);

    // also add the next few hours
    $scope.addDepartureTime(nextTime, 1);
    $scope.addDepartureTime(nextTime, 1);
    
    // every three hours for the first 24, starting on the next multiple of 3
    nextTime.setHours(nextTime.getHours() - nextTime.getHours() % 3);
    for( var idx = 0; idx < 24; idx += 3 ) {
      $scope.addDepartureTime(nextTime, 3);
    }

    // every 6 hours for the next 48
    for( var idx = 0; idx < 42; idx += 6 ) {
      $scope.addDepartureTime(nextTime, 6);
    }
  };

  // add a given departure time display and obj to the slider menu
  $scope.addDepartureTime = function(theDateTime, theHourOffset) {

    if( ! $scope.routePlaces.start ) {
      return;
    }

    theDateTime.add({ hours: theHourOffset});

    var theLocation =  $scope.forecastMarkers[0].properties;
    var dateTimeString = forecastService.createPrettyLocalDateTime(theLocation.latitude, theLocation.longitude, theDateTime);

    $scope.departureTimeDisplays.push(
      {
        'display':dateTimeString, 
        'dateObj': new Date(theDateTime.getTime())
      }
      );
  }

   // handle slide events
  $scope.slideDelegate = function (value, event) {

    var dt =  $scope.departureTimeDisplays[value].dateObj;
      if( dt === null ) {
        dt = new Date();
      }
      
    $scope.forecastMarkers.forEach(function(geoJSON) {
      forecastService.updateGeoJSONInstance(geoJSON, dt);
    });
  };

  // watching so we an update the time.... there has to 
  // be a better way...
  $scope.$watch(
    function watchForecastModelTimezone( scope ) {
        // Return the "result" of the watch expression.
        if( $scope.forecastMarkers.length > 0) {
          return $scope.forecastMarkers[0].properties.icon;
        }
        return( "" );
    },
    function handleChange( newValue, oldValue ) {
        $scope.rebuildDepartureTimes();
    }
  );
  $scope.createWeatherStepsFromDirections = function(directions, routeIdx) {

      // reset our directions markers
      $scope.forecastMarkers = [];

      // if there's no directions, we;re done
      if( !directions || !directions.routes  || directions.routes.length <= routeIdx) {
        return;
      }

      $scope.routeUpToDate = true;

      // calcualte the weather steps for each leg    
      for( var idx = 0; idx < directions.routes[routeIdx].legs.length; idx++) {
        $scope.addWeatherStepsFromLeg(directions.routes[routeIdx].legs[idx], $scope.forecastMarkers);
      }
  }

  // add weather steps from the path outlined by a given leg:
  // about 1 every 100 km
  $scope.addWeatherStepsFromLeg = function(leg, forecastMarkers) {

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

        // var d = Math.acos(
        //   Math.cos(latRad1)*Math.cos(lonRad1)*Math.cos(latRad2)*Math.cos(lonRad2) + 
        //   Math.cos(latRad1)*Math.sin(lonRad1)*Math.cos(latRad2)*Math.sin(lonRad2) + 
        //   Math.sin(latRad1)*Math.sin(latRad2)) 
        // * RADIUS;
        
        // less accurate???
        // var d = Math.acos(
        //   Math.cos(latRad1)*Math.cos(latRad2)*Math.cos(lonRad1-lonRad2) + 
        //   Math.sin(latRad1)*Math.sin(latRad2)) 
        // * RADIUS;

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
          $scope.addWeatherStepLater(step.lat_lngs[0], distanceMeters, travelSecs, step.lat_lngs[jj], lastDistance, departureTime, forecastMarkers);

        }
      }
      
      distanceMeters += step.distance.value;
      travelSecs += step.duration.value;
    }
  }

  // add a weaterh step after getting additional info about it from google
  $scope.addWeatherStepLater = function(origin, travelMeters, travelSecs, destination, destTravelMeters, departureTime, forecastMarkers, tryCount){
    if( tryCount === undefined ) {
      tryCount = 0;
    }
    var request = {
      origin: origin,
      destination: destination,
      travelMode: google.maps.DirectionsTravelMode.DRIVING
    };

    // Route the directions and pass the response to a
    // function to create markers for each step.
    var directionsService = new $scope.maps.DirectionsService();

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
              $scope.addWeatherStepLater(origin, travelMeters, travelSecs, destination, destTravelMeters, departureTime, forecastMarkers, tryCount++);
          }, 3000);

        }
      }
    });
  }
  // get google directions
  $scope.calcRoute = function (routePlaces) {
    if( routePlaces.start === null || routePlaces.end === null ) {
      return;
    }

    var request = {
      origin: routePlaces.start.geometry.location,
      destination: routePlaces.end.geometry.location,
      travelMode: $scope.maps.TravelMode.DRIVING,
      provideRouteAlternatives: true
    };

    var directionsService = new $scope.maps.DirectionsService();
    directionsService.route(request, function(directionResult, status) {


      if (status === $scope.maps.DirectionsStatus.OK || status === $scope.maps.DirectionsStatus.ZERO_RESULTS) {
          $log.debug("DirectionsResult");
          $log.debug(directionResult);

          // tell the scope that our route is out of date
          $scope.routeUpToDate = false;

          // display the directions on the map and in the steps
          $scope.directionsDisplay.setMap($scope.map.control.getGMap());
          $scope.directionsDisplay.setPanel(document.getElementById("directionSteps"));
          $scope.directionsDisplay.setDirections(directionResult);
        }
        else {
          $scope.directionsDisplay.setDirections(null);         
        }
      });
  };
 
  
}])

