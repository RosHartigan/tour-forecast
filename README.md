Tour Forecast
=============

A web app that allows you to check the forecast for your roadtrip, leaving either now or at some point over the next few days.

You can see it working at [Tour Forecast](http://www.bluepontiacmusic.com/tourforecast.com)

I put it together using a CGI perl script to fetch the forecast from NWS, created the front end using Angular and Google Maps, mainly as a way to experiment with Angular and NWS's digital forecast products.

With thanks to:
Angular
Google Maps
ui-bootstrap
angular-google-maps
seiyria-bootstrap-slider
angular-bootstrap-slider

Changes to be made:

Still putting the test framework together
switch the CGI/perl backend to something else that makes integrated testing easier? python? jsonp/javascript 
Move the whole thing to a designated server using play/java on the backend perhaps!
remove angular-google-map dependency, switch to data layer for icon display
Try OpenWeatherLayer, Weather Underground, and yr.no for forecasts outside of US
Try mapbox/leaflet for the map/directions

Pie in the sky:
Add forecast map overlays using NWS digital imaging service

