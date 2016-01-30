
var mapApp = angular.module('tour-forecast-app', ['uiGmapgoogle-maps'])

.config(['uiGmapGoogleMapApiProvider', '$httpProvider', function (GoogleMapApi, $httpProvider) {
  GoogleMapApi.configure({
//    key: 'your api key',
    // v: '3.20',
    libraries: 'drawing,geometry,visualization,places'
  });
          $httpProvider.defaults.useXDomain = true;

          /**
           * Just setting useXDomain to true is not enough. AJAX request are also
           * send with the X-Requested-With header, which indicate them as being
           * AJAX. Removing the header is necessary, so the server is not
           * rejecting the incoming request.
           **/
          delete $httpProvider.defaults.headers.common['X-Requested-With'];
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
        longitude: -73
      },
      options: {
        streetViewControl: false,
        panControl: false,
        maxZoom: 20,
        minZoom: 3
      },
      zoom: 3,
      dragging: false,
      bounds: {},
      forecastMarkers: [
        {
          id: "45,-75",
          "type":"Feature",
          "geometry": { "type": "Point", "coordinates": [45.0, -75.0] },
          "properties" : 
            { 
              "icon": "http://forecast.weather.gov/newimages/medium/ra_sn50.png",
              "place_description" : "Somewhere: 45, -75"
            }
         
        }],
     
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
      //parentdiv:'searchBoxParent',
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
          // display the directions
          directionsDisplay.setPanel(document.getElementById("directionSteps"));
          directionsDisplay.setDirections(directionResult);

          var myRoute = directionResult.routes[0].legs[0];
          var steps = myRoute.steps;

          for( var ii =0; ii < steps.length; ii++ ) {
            var step = steps[ii];
            //$log.debug(step);
            forecastService.addForecastForLocation(step.lat_lngs[0].lat(), step.lat_lngs[0].lng(), step.duration.value, step.distance.value, "" );
          }
  
          // start working on the weather
        }
      });
    return;
  };
}])

.service('forecastService', function($http, $q, pointForecast) {
  var pointForecasts = [];

  this.addForecastForLocation = function(latitude, longitude, duration, distance, departureTime) {
    var pointId = pointForecast.generateId(latitude, longitude);
    var pf = pointForecasts[pointId];
    if( pf !== undefined ) {
      pf.timeOffset = timeOffset;
    }
    else {

      pf = new pointForecast(latitude, longitude, duration, distance);
      pointForecasts[location.toString()] = pf;
    }

    if( pf.isCurrent === false ) {
      return pf.createGeoJSONForDepartureTime(departureTime);
    }

  }


  // fetch the foreast and store it in the geoJSON associated with the point
  this.getDWMLForecast = function(location) {

  }

    
})
.factory('pointForecast', function ($http, $q, $log) {
  // constructor
  function pointForecast(latitude, longitude, duration, distance) {
    this.latitude = latitude;
    this.longitude = longitude;
    this.id = pointForecast.generateId(latitude,longitude);
    this.duration = duration;
    this.distance = distance;
    this.isCurrent = false;
    this.forecast = {};

    return this;
  }

  pointForecast.generateId = function(latitude, longitude) {
      return latitude.toString() + "," + longitude.toString();
  };

  // create a geoJSON object which contains forecast data for 
  // this location, given the specified departure time
  pointForecast.prototype.createGeoJSONForDepartureTime = function(departureTime) {
    var geoJSON = {"type" : "Feature", "id":this.id, "properties": { "icon":"", departureTime: departureTime, arrivalTime: ""}};
    geoJSON.geometry = { "type": "Point",  "coordinates": [this.latitude, this.longitude]};
    geoJSON.properties.icon = "http://www.worldblock.com/sites/default/files/map-marker.png";

    if( this.isCurrent ) {
      this.updateGeoJSON(geoJSON);
    }
    else if (this.fetchGeoJSON !== undefined ) {
      // just update the one we're waiting on
      this.fetchGEOJson.departureTime = departureTime;
      geoJSON = this.fetchGEOJson;
    }
    else {
      this.fetchGeoJSON = geoJSON;
      this.get_NWS_GML_Forecast(departureTime);
    }
    return geoJSON;
  }

  // gather all the forecast data for the right time for this point, 
  // assemble into geoJSON.properties
  pointForecast.prototype.updateGeoJSON = function(geoJSON) {

  }

  // get the National Weather Service gml forecast
  pointForecast.prototype.get_NWS_GML_Forecast = function() {

    var url = "/nws_gml/xml/sample_products/browser_interface/ndfdXMLclient.php?gmlListLatLon=" + this.id + "&featureType=Forecast_Gml2Point&startTime=2013-02-28T19:14:00&compType=Between&propertyName=icons,wx";
    $http.get(url)
          .then(function(response) {
              if (typeof response.data === 'string') {
                  this.isCurrent = true;

                  var gmlDoc;
                  if (window.DOMParser)
                    {
                      parser=new DOMParser();
                      gmlDoc=parser.parseFromString(response.data,"text/xml");
                    }
                  else // Internet Explorer
                    {
                      gmlDoc=new ActiveXObject("Microsoft.XMLDOM");
                      gmlDoc.async=false;
                      gmlDoc.loadXML(response.data);
                    }
                  

                    var forecasts = [];
                    var features = gmlDoc.getElementsByTagName("app:Forecast_Gml2Point");
                    for( var ff = 0; ff < features.length; ff++ ) {
                      var weatherPhraseNode =  features[ff].getElementsByTagName("app:weatherPhrase").item(0);
                      var weatherIconNode =  features[ff].getElementsByTagName("app:weatherIcon").item(0);
                      
                      var validStartTimes = features[ff].getElementsByTagName("app:validTime");
                      for( var tt=0; tt < validStartTimes.length; tt++ ) {
                        var timeKey = validStartTimes[tt].textContent;
                        var timeObject = forecasts[timeKey];
                        $log.debug(timeKey);                        
                        if( timeObject === null || timeObject === undefined ) {
                          timeObject = {};
                          forecasts[timeKey] = timeObject;
                        }
                        if( weatherIconNode !== null ) {
                          timeObject.weatherIcon = weatherIconNode.textContent;
                          $log.debug(timeObject.weatherIcon);
                        }
                        if( weatherPhraseNode !== null ) {
                          timeObject.weatherPhrase = weatherPhraseNode.textContent;
                          $log.debug(timeObject.weatherPhrase);
                        }
                      }
                    }
                    $log.debug(validStartTimeArray);
                  //var ol = 
                  if( this.fetchGeoJSON !== undefined ) {
                    this.fetchGeoJSON.properties.forecasts = forecasts;
                    this.updateGeoJSON(this.fetchGEOJson);
                  }
              } else {
                  // invalid response
                  return $q.reject(response.data);
              }

          }, function(response) {
              // something went wrong
              return $q.reject(response.data);
          });

  }

  return pointForecast;

});