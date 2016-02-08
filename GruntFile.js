module.exports = function(grunt) {

  grunt.initConfig({
    concat: {
	  lodash: {
	    files: {
	      'app/scripts/vendor/lodash/lodash.js': ['bower_components/lodash/lodash.js']
	    }
	  },
	  angular: {
	    files: {
	      'app/scripts/vendor/angular/angular.js': ['bower_components/angular/angular.js']
	    }
	  },
	  angularBootstrap: {
	    files: {
	      'app/scripts/vendor/angular-bootstrap/ui-bootstrap.js': ['bower_components/angular-bootstrap/ui-bootstrap.js'],
	      'app/styles/vendor/angular-bootstrap/ui-bootstrap-csp.css': ['bower_components/angular-bootstrap/ui-bootstrap-csp.css']

	    }
	  },
	  angularSimpleLogger: {
	    files: {
	      'app/scripts/vendor/angular-simple-logger/angular-simple-logger.js': ['bower_components/angular-simple-logger/dist/angular-simple-logger.js']
	    }
	  },
	  angularGoogleMap: {
	    files: {
	      'app/scripts/vendor/angular-google-maps/angular-google-maps.js': ['bower_components/angular-google-maps/dist/angular-google-maps.js']
	    }
	  },
	  bootstrapSlider: {
	    files: {
	      'app/scripts/vendor/seiyria-bootstrap-slider/bootstrap-slider.js': ['bower_components/seiyria-bootstrap-slider/dist/bootstrap-slider.js'],
	      'app/styles/vendor/seiyria-bootstrap-slider/bootstrap-slider.css': ['bower_components/seiyria-bootstrap-slider/dist/css/bootstrap-slider.css']
	    }
	  },

	  angularBootstrapSlider: {
	    files: {
	      'app/scripts/vendor/angular-bootstrap-slider/angular-bootstrap-slider.js': ['bower_components/angular-bootstrap-slider/slider.js']
	    }
	  }
	}
  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-bower-install-simple');
  
	

	grunt.registerTask('bower', [
	  'concat'
	]);


};

