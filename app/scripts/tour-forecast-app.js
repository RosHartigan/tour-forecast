
var mapApp = angular.module('tour-forecast-app', ['uiGmapgoogle-maps', 'forecast-module'])

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

  });
  
  angular.extend($scope, {
   
    map: {
      show: true,
      control: {},
      version: "uknown",
      
      center: {
        latitude: 45,
        longitude: -93
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
    watchPoints: [],

    routePlaces: {
      start:null,
      end:null
    }

  });


  // get google directions
  $scope.calcRoute = function (routePlaces) {
    if( routePlaces.start === null || routePlaces.end === null ) {
      return;
    }

    var directionsDisplay = new $scope.maps.DirectionsRenderer();
    directionsDisplay.setMap($scope.map.control.getGMap());
    
    var request = {
      origin: routePlaces.start.geometry.location,
      destination: routePlaces.end.geometry.location,
      travelMode: $scope.maps.TravelMode.DRIVING
    };

    var directionsService = new $scope.maps.DirectionsService();
    directionsService.route(request, function(directionResult, status) {
      if (status == $scope.maps.DirectionsStatus.OK) {

           $scope.forecastMarkers = [];

          // display the directions
          directionsDisplay.setPanel(document.getElementById("directionSteps"));
          directionsDisplay.setDirections(directionResult);

          var myRoute = directionResult.routes[0].legs[0];
          var steps = myRoute.steps;
          
          var travelSecs = 0; // in seconds
          var distanceMeters = 0; // in meters
          var departureTime = new Date();
          
          var lastTime = 0;
          var lastDistance = 0;

          for( var ii =0; ii < steps.length; ii++ ) {
            var step = steps[ii];
            
            if( ii === 0 || lastTime <= travelSecs - 60*60 || lastDistance <= distanceMeters - 100*1000  ) {  
              var gj = forecastService.createGeoJSONInstance(step.lat_lngs[0].lat(), step.lat_lngs[0].lng(),departureTime, distanceMeters, travelSecs);
              $log.debug(ii + " " + travelSecs);
              $scope.forecastMarkers.push(gj);
              lastTime = travelSecs;
              lastDistance = distanceMeters;
            }
            distanceMeters += step.distance.value;
            travelSecs += step.duration.value;
          }
  
          // now add end location
          var gjend = forecastService.createGeoJSONInstance(myRoute.end_location.lat(), myRoute.end_location.lng(), departureTime, myRoute.distance.value, myRoute.duration.value);
          $log.debug(gjend);
          $scope.forecastMarkers.push(gjend);
             
        }
        else {
           $scope.forecastMarkers = [];
        }
      });
  };
 /* $scope.$watch('watchPoints', function(ov,nv) {
         $log.debug("watching...");
         $log.debug($scope.forecastMarkers);
           
    }, true);*/
}])

