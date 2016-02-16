#!"\Dwimperl\perl\bin\perl.exe"
# 
# nws_forecast
#   Returns an hourly forecast for given lat,lon 72 hours from the given time
#   Returns geoJSON FeatureCollection containing Feature for lat,lon 
#		properties contains:
#			moreWeatherInformation: URL of detailed forecast
#			?? time zone?
#			?? Description of area
#			?? credit/forecast url
#			forecastSeries: array of forecasts by time slice
#					contains:
#						"hazards",
#						"temperature",
#						"weather-text",
#						"weather-icon",
#						"end-time",			(ut)
#						"start-time",		(ut)
#						"local-time"
#
#
#	 IN: lat, lon, ut (unused)
#   OUT: geoJSON Feature, could return collection if we use more than one point
#
#
#	This script uses NWS services to get hourly data.  This is the most complete source of free hourly 
#	weather data, unfortunaly, the products are somewhat disorganized. It's also only good in the US.
#
#	So the output will be build like this:
#
#	First call the digitalJSON product from the forecast service
#   http://forecast.weather.gov/MapClick.php?lg=english&FcstType=digitalJSON&lat=43.6389&lon=-83.291
#		this yields hourly weather information including temp, weather summary, and icons.  
#		However it is missing hazards
#
#	If we can't parse it for some reason ?? try the digitalDWML product from the same service
#
#   http://forecast.weather.gov/MapClick.php?lg=english&FcstType=digitalDWML&lat=43.6389&lon=-83.291
#		This yields a similar report but no icons (why???) and less nice text weather summary
#
#	OR the gml product from the graphical service, which unfortunately gives only three hour updates
#	http://graphical.weather.gov/xml/sample_products/browser_interface/ndfdXMLclient.php?gmlListLatLon=43.6389&lon,-83.291&featureType=Forecast_Gml2Point&propertyName=icons,wx&startTime=2016-01-01T00:00:00&compType=Between";
#
#	Now we can call the the graphical service to get a DWML product containing all the hazards for each hour
#	http://graphical.weather.gov/xml/sample_products/browser_interface/ndfdXMLclient.php?product=time-series&wwa=wwa&listLatLon=43.6389&lon,-83.291
#
#
#	So that gives us three formats to parse:
#		DWML
#		GML
#		NWS's own digitalJSON format which is LOOSELY based on DWML
#
#	And we will output geoJSON as notated above
#
#	Written by Ros Hartigan in 2016
#	www.xrgb.com
#	www.tourforecast.com
#
# Copyright 2016 Rosalind Hartigan
# tour-forecast-app.js is part of TourForecast
#
#-TourForecast is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

# TourForecast is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.

# You should have received a copy of the GNU General Public License
#
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

use LWP::UserAgent;
use XML::LibXML;
use JSON;
use DateTime::Format::ISO8601;
use DateTime;
use CGI;
use CGI::Carp;
use Data::Dumper qw(Dumper);

use lib '.';
use nws_dwml;
use geojson;

my $query = CGI->new;

# only allowing GET
$ENV{'REQUEST_METHOD'} =~ tr/a-z/A-Z/;
if (defined($ENV) && $ENV{'REQUEST_METHOD'} ne "GET")
{
	print $query->header(
	  	-type=>'text/plain',
		-status=> '405 Method Not Allowed'
	);
	exit;
}


#gather the latitude and longitude
my $lat = $query->param('lat');
my $lon = $query->param('lon');

#command line
my $use_pretty = false;

if (not (defined($lat) && defined($lon)) ) {
	($use_pretty, $lat, $lon) = 	@ARGV;
}

# allow them to be undefined
if( not (defined($lat) && defined($lon) && length($lat)>0 && length($lon)>0)) { 

	$lat = "41.0002";  #"42.18939";
	$lon = "-115.5012";#"-83.24337";
}


#gather the passed time and time_zone
#not really using this... soon to be deprecated
my $user_time_utc_str = $query->param('timeutc');
my $time_zone;

if( defined($user_time_utc_str) && length($user_time_utc_str)>0) {
	$user_time_utc = DateTime::Format::ISO8601->parse_datetime( $user_time_utc_str );	
	$user_time_zone=$time_utc->time_zone();		
	$user_time_utc->set_time_zone('UTC');
}
else {
	$user_time_utc = DateTime->now(time_zone => 'UTC' );
	$user_time_zone=$user_time_utc->time_zone();		
}


# print the content header showing we are returning a json object
print $query->header(-type=>'application/json',-expires=>'+1h');

# create our solitary feature
my $feature = geojson::create_feature($lat,$lon);

#create our useragent
my $ua = LWP::UserAgent->new;

#and our json reader/writer
my $json = JSON->new->allow_nonref;



# first we try to use the experimental NWS product - digitalJSON
#   http://forecast.weather.gov/MapClick.php?lg=english&FcstType=digitalJSON&lat=43.6389&lon=-83.291
my $req_str = "http://forecast.weather.gov/MapClick.php?lg=english&FcstType=digitalJSON&lat=$lat&lon=$lon";
push(@{$feature->{properties}{geojson::SOURCES}}, $req_str);

my $req = HTTP::Request->new(GET => $req_str);
my $res = $ua->request($req);
my $bJsonSuccess = $res->is_success;
if ($bJsonSuccess) {
	my $json_string = $res->decoded_content;

	my $jsonObject = eval {
		$json->decode($json_string);
	};

	# report any error that stopped parsing
	if( $@ ) {
		print STDERR "\nERROR in JSON return:\n$@\n";
		$bJsonSuccess = 0;
		push(@{$feature->{properties}{geojson::SOURCES}}, $@);
	}
	else {
		push(@{$feature->{properties}{geojson::SOURCES}}, $res->status_line);
		$feature->{properties}{geojson::CREDIT} = "http://graphical.weather.gov/";
		$feature->{properties}{geojson::CREDITLOGO} = "http://www.weather.gov/images/nws/nws_logo.png";

		my %fieldxfer = (
			'temperature' => geojson::TEMPERATURE,
			'weather' => geojson::WEATHERSUMMARY,
			'iconLink' => geojson::WEATHERICON
			);

		# first: make sure the unixtime is in good shape
		my $unixTime;
		foreach my $jkey (keys %{$jsonObject}) {
			# each time period will have a 'unixtime' field that defines the hours
			my $unixTimeArray = $jsonObject->{$jkey}{'unixtime'};
			if( defined($unixTimeArray) ) {
				my $firstTime = int($unixTimeArray->[0]);
				if( ! defined($unixTime) || ($unixTime > $firstTime)) {
					$unixTime = $firstTime;
				}
			}
		}
		my $unixOffset  = 0;
		my $now = time();
		if( defined($unixTime) && ($unixTime >= ($now + 12 * 60 * 60))) {
			print STDERR "unixTime return from digitalJSON is bad: $unixTime (". DateTime->from_epoch(epoch => $unixTime ).") should be $now (". DateTime->from_epoch(epoch => $now ).")\n";
			$unixOffset = - 24*60*60;
		}

		# loop through the time periods
		foreach my $jkey (keys %{$jsonObject}) {
			if( $jkey eq 'location') {
				$feature->{properties}{geojson::AREADESCRIPTION} = $jsonObject->{$jkey}{areaDescription};;
			}			
			elsif( $jkey eq 'creationDate') {
				
				$feature->{properties}{geojson::CREATIONDATE} = $jsonObject->{$jkey};
				geojson::setTimeZone(%$feature,  $jsonObject->{$jkey});
			}
			# each time period will have a 'unixtime' field that defines the hours
			my $unixTimeArray = $jsonObject->{$jkey}{'unixtime'};
			if( defined($unixTimeArray) ) {
			
				for( my $tidx = 0; $tidx < scalar  (@$unixTimeArray); $tidx++) {
					my $utime = $unixTimeArray->[$tidx] + $unixOffset;
					my $sdt = DateTime->from_epoch(epoch => $utime );
					my $edt = DateTime->from_epoch(epoch => 60 * 60 + $utime );
			
					my $time_key = geojson::create_time_slot(%$feature, $sdt, $edt);

					foreach $param (keys %fieldxfer) {
						my $value = $jsonObject->{$jkey}{$param}[$tidx];
						
						if( defined($value) ) {
							# not a real link - just a name in the nws icon bank
							if( $param eq 'iconLink' && length($value) > 0) {
								$value = geojson::NWSICONDIR . $value;
							}
							$feature->{properties}{geojson::FORECASTSERIES}{$time_key}{$fieldxfer{$param}} = $value;
						}
						else {
							$bJsonSuccess = 0;
						}		
					}
				}
			}
		}	
	}
}
else {
	push(@{$feature->{properties}{geojson::SOURCES}}, $res->status_line);
	print STDERR $res->status_line."\n";
}

# try the digitalDWML
if( not $bJsonSuccess ) {

}
#lastly the DWML time series product that returns warnanings
$req_str = "http://graphical.weather.gov/xml/sample_products/browser_interface/ndfdXMLclient.php?product=time-series";

# fetch temp, weather icons, weather text, and hazards
if( not $bJsonSuccess ) {
	$req_str =  $req_str."&temp=temp&wx=wx&icons=icons&wwa=wwa";
}
# just hazards if json succeeded
else {
	$req_str =  $req_str."&wwa=wwa";
}
# at our location
$req_str = $req_str."&listLatLon=".$lat.",".$lon;#."&begin=".$time_utc;

# send source back
push(@{$feature->{properties}{geojson::SOURCES}}, $req_str);

$req = HTTP::Request->new(GET => $req_str);
$res = $ua->request($req);

if ($res->is_success) {
	
	my $xml_string = $res->decoded_content;
	
	#get rid of carriage returns
	$xml_string =~ s/\R[\t ]*//g;
	
	# initialize parser object and parse the string
	$xml_parser = new XML::LibXML;								 
	
	my $doc = eval {
		$xml_parser->parse_string($xml_string);
	};

	# report any error that stopped parsing
	if( $@ ) {
		$@ =~ s/at \/.*?$//s;               # remove module line number
		print STDERR "\nERROR in xml return:\n$@\n";
		push(@{$feature->{properties}{geojson::SOURCES}}, $@);

	}
	# otherwise parse away
	else {
		push(@{$feature->{properties}{geojson::SOURCES}}, $res->status_line);

		#glean our geoJSON forecast data from the DWML
		nws_dwml::compileForecastFromDWML($doc, %$feature);
	}
}
else {
	push(@{$feature->{properties}{geojson::SOURCES}}, $res->status_line);
	print STDERR $res->status_line."\n";
}

# pretty print for shell
# and sort the hash by key
my $json_printed = $json->pretty($use_pretty)->canonical->encode( $feature );

print $json_printed;

