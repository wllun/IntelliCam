Pod::Spec.new do |s|
  s.name             = 'IntelliCamPhotoMetadata'
  s.version          = '1.0.0'
  s.summary          = 'Preserves and reads IntelliCam JPEG metadata.'
  s.description      = 'A local Expo module for IntelliCam photo metadata.'
  s.license          = { :type => 'MIT' }
  s.author           = 'IntelliCam'
  s.homepage         = 'https://example.invalid/intellicam'
  s.platforms        = { :ios => '15.1' }
  s.source           = { :git => 'https://github.com/expo/expo.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
