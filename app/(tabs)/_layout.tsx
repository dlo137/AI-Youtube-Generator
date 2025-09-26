import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#9ca3af',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopColor: '#000000',
          paddingBottom: 15,
          paddingTop: 5,
          height: 75,
        },
        headerStyle: {
          backgroundColor: '#000000',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerLeft: () => (
          <TouchableOpacity style={{ marginLeft: 15, padding: 5 }}>
            <Text style={{ color: '#fff', fontSize: 32 }}>≡</Text>
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity style={{
            marginRight: 15,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: '#FFD700',
            borderRadius: 16,
            backgroundColor: 'transparent',
          }}>
            <Text style={{
              color: '#FFD700',
              fontSize: 12,
              fontWeight: '600',
              textAlign: 'center'
            }}>
              Get Pro
            </Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="generate"
        options={{
          title: 'Generator',
          tabBarIcon: ({ color }) => (
            <View style={{
              width: 22,
              height: 18,
              borderWidth: 2,
              borderColor: color,
              borderRadius: 2,
              position: 'relative'
            }}>
              <View style={{
                position: 'absolute',
                top: 2,
                left: 2,
                width: 6,
                height: 6,
                backgroundColor: color,
                borderRadius: 3
              }} />
              <View style={{
                position: 'absolute',
                bottom: 2,
                left: 2,
                right: 2,
                height: 2,
                backgroundColor: color
              }} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Thumbnails',
          tabBarIcon: ({ color }) => (
            <View style={{ flexDirection: 'row', gap: 2 }}>
              <View style={{
                width: 10,
                height: 14,
                borderWidth: 1.5,
                borderColor: color,
                borderRadius: 1,
                backgroundColor: 'transparent'
              }} />
              <View style={{
                width: 10,
                height: 14,
                borderWidth: 1.5,
                borderColor: color,
                borderRadius: 1,
                backgroundColor: 'transparent'
              }} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <View style={{ alignItems: 'center' }}>
              <View style={{
                width: 8,
                height: 8,
                backgroundColor: color,
                borderRadius: 4,
                marginBottom: 1
              }} />
              <View style={{
                width: 14,
                height: 12,
                backgroundColor: color,
                borderTopLeftRadius: 7,
                borderTopRightRadius: 7
              }} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}